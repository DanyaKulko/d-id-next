"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { parseStoredDocumentIds } from "@/lib/external-sources/documents";
import { knowledgeQueue } from "@/lib/external-sources/queue";
import { resolveBaseUrl } from "@/lib/http/base-url";
import { didService } from "@/lib/services/did.service";
import {
  defaultPersonalityStyle,
  getString,
  disabledKnowledgeDocsKey,
  manualTrainingDocKey,
  manualTrainingFileKey,
  manualTrainingKey,
  manualTrainingSource,
  normalizePersonalityStyle,
  requireAdmin,
  safetyRulesKey,
  textBlogEnabledKey,
  textBlogSource,
  updateDidAgentFromRole,
  videoTranscriptsSource,
  withDidLogging,
} from "./shared";

const normalizeKnowledgeSource = (value: string) => {
  const key = value.trim().toLowerCase();
  if (key === manualTrainingSource.toLowerCase()) return manualTrainingSource;
  if (key === textBlogSource.toLowerCase()) return textBlogSource;
  if (key === videoTranscriptsSource.toLowerCase()) {
    return videoTranscriptsSource;
  }
  return value.trim();
};

const normalizeDidDocumentId = (value: string) =>
  value.includes("#") ? (value.split("#").pop() ?? value) : value;

const matchesDidDocumentId = (value: string, candidate: string) =>
  value === candidate ||
  normalizeDidDocumentId(value) === normalizeDidDocumentId(candidate);

const parseDisabledDocIds = (value?: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry ?? "").trim()).filter(Boolean);
    }
  } catch {
    // ignore parse errors
  }
  const trimmed = value.trim();
  return trimmed ? [trimmed] : [];
};

const persistDisabledDocIds = async (ids: string[]) => {
  if (ids.length === 0) {
    await prisma.appSetting.deleteMany({
      where: { key: disabledKnowledgeDocsKey },
    });
    return;
  }
  await prisma.appSetting.upsert({
    where: { key: disabledKnowledgeDocsKey },
    update: { value: JSON.stringify(ids) },
    create: { key: disabledKnowledgeDocsKey, value: JSON.stringify(ids) },
  });
};

const collectEnabledDocIds = (
  docs: { documentId: string | null; id: string }[],
  disabled: Set<string>,
) => {
  return docs
    .map((doc) => doc.documentId)
    .filter((docId): docId is string => Boolean(docId))
    .filter((docId) => {
      const normalized = normalizeDidDocumentId(docId);
      return !disabled.has(docId) && !disabled.has(normalized);
    });
};

const updateExternalSourceDocIds = async (
  kind: "TEXT" | "VIDEO",
  disabled: Set<string>,
) => {
  const sourceLabel = kind === "TEXT" ? textBlogSource : videoTranscriptsSource;
  const docs = await prisma.knowledgeDocuments.findMany({
    where: { source: { equals: sourceLabel, mode: "insensitive" } },
    select: { id: true, documentId: true },
    orderBy: { createdAt: "asc" },
  });
  const enabledDocIds = collectEnabledDocIds(docs, disabled);
  await prisma.externalSource.updateMany({
    where: { kind },
    data: { documentId: enabledDocIds.length > 0 ? JSON.stringify(enabledDocIds) : null },
  });
};

const knowledgeUploadRoot = path.join(
  process.cwd(),
  "public",
  "uploads",
  "knowledge",
);

async function writeManualTrainingFile(text: string) {
  await mkdir(knowledgeUploadRoot, { recursive: true });
  const filename = `manual-training-${Date.now()}-${randomUUID()}.txt`;
  const filePath = path.join(knowledgeUploadRoot, filename);
  await writeFile(filePath, text, "utf8");
  return {
    filePath,
    publicPath: `/uploads/knowledge/${filename}`,
  };
}

export async function saveSafetyInstructionsAction(formData: FormData) {
  await requireAdmin();
  const safetyRules = getString(formData.get("safetyRules")).trim();
  if (!safetyRules) {
    throw new Error("Safety rules cannot be empty");
  }

  await prisma.appSetting.upsert({
    where: { key: safetyRulesKey },
    update: { value: safetyRules },
    create: { key: safetyRulesKey, value: safetyRules },
  });

  const agents = await prisma.agent.findMany({
    select: {
      agentId: true,
      name: true,
      description: true,
      roleDescription: true,
      instructions: true,
      personality: true,
      voiceID: true,
    },
  });

  for (const agent of agents) {
    if (!agent.agentId) continue;
    await updateDidAgentFromRole(agent.agentId, {
      name: agent.name,
      description: agent.description ?? "",
      role: agent.roleDescription ?? "",
      systemPrompt: agent.instructions ?? "",
      safetyRules,
      personalityStyle: normalizePersonalityStyle(
        agent.personality ?? defaultPersonalityStyle,
      ),
      voiceId: agent.voiceID ?? "",
    });
  }

  revalidatePath("/admin/training");
  revalidatePath("/admin/training/safety");
  return { ok: true };
}

export async function saveManualTrainingAction(formData: FormData) {
  await requireAdmin();
  const manualText = getString(formData.get("manualLearning")).trim();
  if (!manualText) {
    throw new Error("Manual training text is required");
  }

  await prisma.appSetting.upsert({
    where: { key: manualTrainingKey },
    update: { value: manualText },
    create: { key: manualTrainingKey, value: manualText },
  });

  const knowledgeBaseId = process.env.DID_KNOWLEDGE_BASE_ID ?? "";
  if (!knowledgeBaseId) {
    throw new Error("DID_KNOWLEDGE_BASE_ID is missing");
  }

  const baseUrl = await resolveBaseUrl();

  const existingDoc = await prisma.appSetting.findUnique({
    where: { key: manualTrainingDocKey },
  });
  if (existingDoc?.value) {
    await withDidLogging("Delete Knowledge Document", () =>
      didService.deleteKnowledgeDocument(knowledgeBaseId, existingDoc.value),
    ).catch(() => undefined);
  }

  const existingFile = await prisma.appSetting.findUnique({
    where: { key: manualTrainingFileKey },
  });
  if (existingFile?.value) {
    await unlink(existingFile.value).catch(() => undefined);
  }

  const { filePath, publicPath } = await writeManualTrainingFile(manualText);
  await prisma.appSetting.upsert({
    where: { key: manualTrainingFileKey },
    update: { value: filePath },
    create: { key: manualTrainingFileKey, value: filePath },
  });

  const webhookUrl = `${baseUrl}/api/webhooks/did/knowledge`;

  const created = await withDidLogging("Create Knowledge Document", () =>
    didService.createKnowledgeDocument(knowledgeBaseId, {
      documentType: "text",
      source_url: `${baseUrl}${publicPath}`,
      title: manualTrainingSource,
      webhook: webhookUrl,
    }),
  );

  const docId =
    (created as Record<string, unknown>)?.id ??
    (created as Record<string, unknown>)?.document_id ??
    (created as Record<string, unknown>)?.documentId;

  if (docId) {
    await prisma.appSetting.upsert({
      where: { key: manualTrainingDocKey },
      update: { value: String(docId) },
      create: { key: manualTrainingDocKey, value: String(docId) },
    });

    await prisma.knowledgeDocuments.deleteMany({
      where: {
        source: { equals: manualTrainingSource, mode: "insensitive" },
      },
    });
    await prisma.knowledgeDocuments.create({
      data: {
        source: manualTrainingSource,
        documentId: String(docId),
        documentUrl: `${baseUrl}${publicPath}`,
        status: "PROCESSING",
      },
    });
  }

  revalidatePath("/admin/training");
  revalidatePath("/admin/training/archive");
  revalidatePath("/admin/training/manual");
  return { ok: true };
}

const parseCategoryIds = (value?: string | null) => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
};

export async function toggleTextBlogKnowledgeAction(formData: FormData) {
  await requireAdmin();
  const enabledValue = getString(formData.get("enabled")).trim();
  const enabled = enabledValue === "true";

  await prisma.appSetting.upsert({
    where: { key: textBlogEnabledKey },
    update: { value: enabled ? "true" : "false" },
    create: { key: textBlogEnabledKey, value: enabled ? "true" : "false" },
  });

  if (!enabled) {
    const knowledgeBaseId = process.env.DID_KNOWLEDGE_BASE_ID ?? "";
    const [textSource, localDocs] = await Promise.all([
      prisma.externalSource.findUnique({ where: { kind: "TEXT" } }),
      prisma.knowledgeDocuments.findMany({
        where: {
          source: { equals: textBlogSource, mode: "insensitive" },
        },
      }),
    ]);

    const docIds = new Set<string>();
    for (const docId of parseStoredDocumentIds(textSource?.documentId ?? null)) {
      if (docId) docIds.add(docId);
    }
    for (const doc of localDocs) {
      if (doc.documentId) docIds.add(doc.documentId);
    }

    if (knowledgeBaseId && docIds.size > 0) {
      for (const docId of docIds) {
        await withDidLogging("Delete Knowledge Document", () =>
          didService.deleteKnowledgeDocument(knowledgeBaseId, docId),
        ).catch(() => undefined);
      }
    }

    if (localDocs.length > 0) {
      await prisma.processedPost.updateMany({
        where: {
          knowledgeDocumentId: { in: localDocs.map((doc) => doc.id) },
        },
        data: { knowledgeDocumentId: null },
      });

      await prisma.knowledgeDocuments.deleteMany({
        where: { id: { in: localDocs.map((doc) => doc.id) } },
      });
    } else {
      await prisma.processedPost.updateMany({
        where: { knowledgeDocumentId: { not: null } },
        data: { knowledgeDocumentId: null },
      });
    }

    if (textSource?.id) {
      await prisma.externalSource.update({
        where: { id: textSource.id },
        data: { documentId: null, filePath: null },
      });
    }
  } else {
    const categoryIds = parseCategoryIds(process.env.DOND_POST_CATEGORY_IDS);
    if (categoryIds.length === 0) {
      throw new Error("No category IDs configured for blog sync");
    }

    await knowledgeQueue.add(
      "knowledge-sync-queue",
      {
        apiUrl: process.env.DOND_POSTS_URL || "https://malinicms.com/api/v2/posts",
        categories: categoryIds,
      },
      {
        removeOnComplete: true,
        removeOnFail: 10,
      },
    );
  }

  revalidatePath("/admin/training");
  revalidatePath("/admin/training/archive");
  return { ok: true, enabled };
}

export async function deleteKnowledgeDocumentAction(formData: FormData) {
  await requireAdmin();
  const documentId = getString(formData.get("documentId")).trim();
  const sourceLabel = getString(formData.get("sourceLabel")).trim();

  if (!documentId && !sourceLabel) {
    throw new Error("Document id or source label is required");
  }

  const knowledgeBaseId = process.env.DID_KNOWLEDGE_BASE_ID ?? "";
  const normalizedSource = sourceLabel
    ? normalizeKnowledgeSource(sourceLabel)
    : "";

  const [manualDoc, manualFile, externalSources, disabledSetting] =
    await Promise.all([
      prisma.appSetting.findUnique({ where: { key: manualTrainingDocKey } }),
      prisma.appSetting.findUnique({ where: { key: manualTrainingFileKey } }),
      prisma.externalSource.findMany(),
      prisma.appSetting.findUnique({ where: { key: disabledKnowledgeDocsKey } }),
    ]);

  const textSource = externalSources.find((item) => item.kind === "TEXT");
  const videoSource = externalSources.find((item) => item.kind === "VIDEO");

  const docIdCandidates = new Map<string, string>();
  if (manualDoc?.value) {
    docIdCandidates.set(manualDoc.value, manualTrainingSource);
  }
  if (textSource?.documentId) {
    docIdCandidates.set(textSource.documentId, textBlogSource);
  }
  if (videoSource?.documentId) {
    docIdCandidates.set(videoSource.documentId, videoTranscriptsSource);
  }

  const expectedSource =
    Array.from(docIdCandidates.entries()).find(([docId]) =>
      matchesDidDocumentId(docId, documentId),
    )?.[1] ?? normalizedSource;
  const isManual = expectedSource === manualTrainingSource;
  const isText = expectedSource === textBlogSource;
  const isVideo = expectedSource === videoTranscriptsSource;

  const localDoc = documentId
    ? await prisma.knowledgeDocuments.findFirst({
        where: {
          OR: [{ documentId }, { id: documentId }],
        },
      })
    : null;

  const didDocumentId = localDoc?.documentId ?? documentId;

  if (knowledgeBaseId && didDocumentId) {
    await withDidLogging("Delete Knowledge Document", () =>
      didService.deleteKnowledgeDocument(knowledgeBaseId, didDocumentId),
    ).catch(() => undefined);
  }

  if (isManual) {
    if (manualFile?.value) {
      await unlink(manualFile.value).catch(() => undefined);
    }
    await prisma.appSetting.deleteMany({
      where: { key: manualTrainingDocKey },
    });
    await prisma.appSetting.deleteMany({
      where: { key: manualTrainingFileKey },
    });
    await prisma.knowledgeDocuments.deleteMany({
      where: {
        source: { equals: manualTrainingSource, mode: "insensitive" },
      },
    });
  } else if (isText || isVideo) {
    const sourceRow = isText ? textSource : videoSource;
    if (sourceRow?.filePath) {
      await unlink(sourceRow.filePath).catch(() => undefined);
    }
    if (sourceRow?.id) {
      await prisma.externalSource.update({
        where: { id: sourceRow.id },
        data: { documentId: null, filePath: null },
      });
    }
    await prisma.knowledgeDocuments.deleteMany({
      where: {
        source: {
          equals: expectedSource,
          mode: "insensitive",
        },
      },
    });
  } else if (documentId) {
    await prisma.knowledgeDocuments.deleteMany({
      where: { OR: [{ documentId }, { id: documentId }] },
    });
  }

  if (documentId) {
    const disabled = new Set(parseDisabledDocIds(disabledSetting?.value));
    disabled.delete(documentId);
    disabled.delete(normalizeDidDocumentId(documentId));
    if (localDoc?.id) disabled.delete(localDoc.id);
    if (localDoc?.documentId) {
      disabled.delete(localDoc.documentId);
      disabled.delete(normalizeDidDocumentId(localDoc.documentId));
    }
    await persistDisabledDocIds(Array.from(disabled));
  }

  revalidatePath("/admin/training");
  revalidatePath("/admin/training/archive");
  return { ok: true };
}

export async function toggleKnowledgeDocumentEnabledAction(
  formData: FormData,
) {
  await requireAdmin();
  const documentId = getString(formData.get("documentId")).trim();
  const enabledValue = getString(formData.get("enabled")).trim();
  const enabled = enabledValue === "true";

  if (!documentId) {
    throw new Error("Document id is required");
  }

  const [disabledSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: disabledKnowledgeDocsKey } }),
  ]);
  const disabled = new Set(parseDisabledDocIds(disabledSetting?.value));

  const localDoc = await prisma.knowledgeDocuments.findFirst({
    where: { OR: [{ id: documentId }, { documentId }] },
  });

  if (!localDoc) {
    throw new Error("Knowledge document not found");
  }

  const knowledgeBaseId = process.env.DID_KNOWLEDGE_BASE_ID ?? "";
  const baseUrl = await resolveBaseUrl();

  if (enabled) {
    disabled.delete(documentId);
    disabled.delete(normalizeDidDocumentId(documentId));
    if (localDoc.id) disabled.delete(localDoc.id);
    if (localDoc.documentId) {
      disabled.delete(localDoc.documentId);
      disabled.delete(normalizeDidDocumentId(localDoc.documentId));
    }

    if (!knowledgeBaseId) {
      throw new Error("DID_KNOWLEDGE_BASE_ID is missing");
    }
    if (!localDoc.documentUrl) {
      throw new Error("Document URL is missing");
    }

    const webhookUrl = `${baseUrl}/api/webhooks/did/knowledge`;
    const created = await withDidLogging("Create Knowledge Document", () =>
      didService.createKnowledgeDocument(knowledgeBaseId, {
        documentType: "text",
        source_url: localDoc.documentUrl!,
        title: localDoc.source,
        webhook: webhookUrl,
      }),
    );

    const newDocId =
      (created as Record<string, unknown>)?.id ??
      (created as Record<string, unknown>)?.document_id ??
      (created as Record<string, unknown>)?.documentId;

    await prisma.knowledgeDocuments.update({
      where: { id: localDoc.id },
      data: {
        documentId: newDocId ? String(newDocId) : localDoc.documentId,
        status: "PROCESSING",
      },
    });

    if (localDoc.source === manualTrainingSource) {
      if (newDocId) {
        await prisma.appSetting.upsert({
          where: { key: manualTrainingDocKey },
          update: { value: String(newDocId) },
          create: { key: manualTrainingDocKey, value: String(newDocId) },
        });
      }
    }
  } else {
    disabled.add(documentId);
    if (localDoc.documentId) {
      disabled.add(localDoc.documentId);
      disabled.add(normalizeDidDocumentId(localDoc.documentId));
    }
    if (localDoc.id) {
      disabled.add(localDoc.id);
    }

    if (knowledgeBaseId && localDoc.documentId) {
      await withDidLogging("Delete Knowledge Document", () =>
        didService.deleteKnowledgeDocument(knowledgeBaseId, localDoc.documentId!),
      ).catch(() => undefined);
    }

    if (localDoc.source === manualTrainingSource) {
      await prisma.appSetting.deleteMany({
        where: { key: manualTrainingDocKey },
      });
    }
  }

  await persistDisabledDocIds(Array.from(disabled));

  if (localDoc.source === textBlogSource) {
    await updateExternalSourceDocIds("TEXT", disabled);
  }
  if (localDoc.source === videoTranscriptsSource) {
    await updateExternalSourceDocIds("VIDEO", disabled);
  }

  if (!enabled && localDoc.source === manualTrainingSource) {
    // Keep local document url for fast re-enable.
  }

  revalidatePath("/admin/training");
  revalidatePath("/admin/training/archive");

  return {
    ok: true,
    enabled,
    status: enabled ? "processing" : undefined,
  };
}
