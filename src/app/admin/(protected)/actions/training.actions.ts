"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import {
  parseStoredDocumentIds,
  serializeDocumentIds,
} from "@/lib/external-sources/documents";
import { resolveBaseUrl } from "@/lib/http/base-url";
import { didService } from "@/lib/services/did.service";
import {
  defaultPersonalityStyle,
  getString,
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

const updateExternalSourceDocIds = async (kind: "TEXT" | "VIDEO") => {
  const sourceLabel = kind === "TEXT" ? textBlogSource : videoTranscriptsSource;
  const docs = await prisma.knowledgeDocuments.findMany({
    where: {
      source: { equals: sourceLabel, mode: "insensitive" },
      isEnabled: true,
      documentId: { not: null },
    },
    select: { documentId: true },
    orderBy: { createdAt: "asc" },
  });
  const enabledDocIds: string[] = [];
  const seenNormalized = new Set<string>();
  for (const doc of docs) {
    if (!doc.documentId) continue;
    const normalized = normalizeDidDocumentId(doc.documentId);
    if (seenNormalized.has(normalized)) continue;
    seenNormalized.add(normalized);
    enabledDocIds.push(doc.documentId);
  }
  const data: { documentId: string | null; filePath?: string | null } = {
    documentId: serializeDocumentIds(enabledDocIds),
  };
  if (enabledDocIds.length === 0) {
    data.filePath = null;
  }
  await prisma.externalSource.updateMany({
    where: { kind },
    data,
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
        title: manualTrainingSource,
        documentId: String(docId),
        documentUrl: `${baseUrl}${publicPath}`,
        status: "PROCESSING",
        isEnabled: true,
      },
    });
  }

  revalidatePath("/admin/training");
  revalidatePath("/admin/training/archive");
  revalidatePath("/admin/training/manual");
  return { ok: true };
}

export async function toggleTextBlogKnowledgeAction(formData: FormData) {
  await requireAdmin();
  const enabledValue = getString(formData.get("enabled")).trim();
  const enabled = enabledValue === "true";

  await prisma.appSetting.upsert({
    where: { key: textBlogEnabledKey },
    update: { value: enabled ? "true" : "false" },
    create: { key: textBlogEnabledKey, value: enabled ? "true" : "false" },
  });

  const knowledgeBaseId = process.env.DID_KNOWLEDGE_BASE_ID ?? "";
  const [textSource, localDocs] = await Promise.all([
    prisma.externalSource.findUnique({ where: { kind: "TEXT" } }),
    prisma.knowledgeDocuments.findMany({
      where: {
        source: { equals: textBlogSource, mode: "insensitive" },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        documentId: true,
        documentUrl: true,
        source: true,
        title: true,
        isEnabled: true,
      },
    }),
  ]);

  if (!enabled) {
    const docIdsToDelete = new Set<string>();
    for (const docId of parseStoredDocumentIds(
      textSource?.documentId ?? null,
    )) {
      if (!docId) continue;
      docIdsToDelete.add(docId);
      docIdsToDelete.add(normalizeDidDocumentId(docId));
    }
    for (const doc of localDocs) {
      if (!doc.documentId) continue;
      docIdsToDelete.add(doc.documentId);
      docIdsToDelete.add(normalizeDidDocumentId(doc.documentId));
    }

    if (knowledgeBaseId && docIdsToDelete.size > 0) {
      for (const docId of docIdsToDelete) {
        await withDidLogging("Delete Knowledge Document", () =>
          didService.deleteKnowledgeDocument(knowledgeBaseId, docId),
        ).catch(() => undefined);
      }
    }

    await prisma.knowledgeDocuments.updateMany({
      where: {
        source: { equals: textBlogSource, mode: "insensitive" },
      },
      data: { isEnabled: false },
    });
  } else {
    if (!knowledgeBaseId) {
      throw new Error("DID_KNOWLEDGE_BASE_ID is missing");
    }

    const baseUrl = await resolveBaseUrl();
    const webhookUrl = `${baseUrl}/api/webhooks/did/knowledge`;

    for (const [index, doc] of localDocs.entries()) {
      if (doc.isEnabled) continue;

      const sourceUrl = doc.documentUrl;
      if (!sourceUrl) {
        await prisma.knowledgeDocuments.update({
          where: { id: doc.id },
          data: { status: "FAILED" },
        });
        continue;
      }
      const normalizedTitle = doc.title?.trim() ?? "";
      const shouldUsePartTitle =
        doc.source === textBlogSource &&
        (!normalizedTitle ||
          normalizedTitle.toLowerCase() === textBlogSource.toLowerCase());
      const title = shouldUsePartTitle
        ? `Text Blog (Part #${index + 1})`
        : normalizedTitle || doc.source;

      const created = await withDidLogging("Create Knowledge Document", () =>
        didService.createKnowledgeDocument(knowledgeBaseId, {
          documentType: "text",
          source_url: sourceUrl,
          title,
          webhook: webhookUrl,
        }),
      );
      const newDocId =
        (created as Record<string, unknown>)?.id ??
        (created as Record<string, unknown>)?.document_id ??
        (created as Record<string, unknown>)?.documentId;
      if (!newDocId) {
        throw new Error("D-ID did not return document id");
      }

      await prisma.knowledgeDocuments.update({
        where: { id: doc.id },
        data: {
          documentId: String(newDocId),
          title,
          status: "PROCESSING",
          isEnabled: true,
        },
      });
    }
  }

  await updateExternalSourceDocIds("TEXT");

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

  const [manualDoc, manualFile, externalSources] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: manualTrainingDocKey } }),
    prisma.appSetting.findUnique({ where: { key: manualTrainingFileKey } }),
    prisma.externalSource.findMany(),
  ]);

  const textSource = externalSources.find((item) => item.kind === "TEXT");
  const videoSource = externalSources.find((item) => item.kind === "VIDEO");
  const textSourceDocIds = parseStoredDocumentIds(
    textSource?.documentId ?? null,
  );
  const videoSourceDocIds = parseStoredDocumentIds(
    videoSource?.documentId ?? null,
  );

  const docIdCandidates = new Map<string, string>();
  if (manualDoc?.value) {
    docIdCandidates.set(manualDoc.value, manualTrainingSource);
  }
  for (const docId of textSourceDocIds) {
    docIdCandidates.set(docId, textBlogSource);
  }
  for (const docId of videoSourceDocIds) {
    docIdCandidates.set(docId, videoTranscriptsSource);
  }

  const expectedSource =
    Array.from(docIdCandidates.entries()).find(([docId]) =>
      matchesDidDocumentId(docId, documentId),
    )?.[1] ?? normalizedSource;
  const isManual = expectedSource === manualTrainingSource;
  const isText = expectedSource === textBlogSource;
  const isVideo = expectedSource === videoTranscriptsSource;

  const localDocs = documentId
    ? await prisma.knowledgeDocuments.findMany({
        where: {
          OR: [{ documentId }, { id: documentId }],
        },
        select: { id: true, documentId: true },
      })
    : [];

  const didDocumentIdsToDelete = new Set<string>();
  if (documentId) {
    didDocumentIdsToDelete.add(documentId);
    didDocumentIdsToDelete.add(normalizeDidDocumentId(documentId));
  }
  for (const localDoc of localDocs) {
    if (!localDoc.documentId) continue;
    didDocumentIdsToDelete.add(localDoc.documentId);
    didDocumentIdsToDelete.add(normalizeDidDocumentId(localDoc.documentId));
  }

  if (knowledgeBaseId && didDocumentIdsToDelete.size > 0) {
    for (const didDocumentId of didDocumentIdsToDelete) {
      await withDidLogging("Delete Knowledge Document", () =>
        didService.deleteKnowledgeDocument(knowledgeBaseId, didDocumentId),
      ).catch(() => undefined);
    }
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
    } else if (documentId) {
      await prisma.knowledgeDocuments.deleteMany({
        where: { OR: [{ documentId }, { id: documentId }] },
      });
    }
    if (isText) {
      await updateExternalSourceDocIds("TEXT");
    }
    if (isVideo) {
      await updateExternalSourceDocIds("VIDEO");
    }
  } else if (documentId) {
    if (localDocs.length > 0) {
      await prisma.processedPost.updateMany({
        where: {
          knowledgeDocumentId: { in: localDocs.map((doc) => doc.id) },
        },
        data: { knowledgeDocumentId: null },
      });
    }
    await prisma.knowledgeDocuments.deleteMany({
      where: { OR: [{ documentId }, { id: documentId }] },
    });
  }

  revalidatePath("/admin/training");
  revalidatePath("/admin/training/archive");
  return { ok: true };
}

export async function toggleKnowledgeDocumentEnabledAction(formData: FormData) {
  await requireAdmin();
  const documentId = getString(formData.get("documentId")).trim();
  const enabledValue = getString(formData.get("enabled")).trim();
  const enabled = enabledValue === "true";

  if (!documentId) {
    throw new Error("Document id is required");
  }

  const normalizedDocId = normalizeDidDocumentId(documentId);

  const localDoc = await prisma.knowledgeDocuments.findFirst({
    where: {
      OR: [
        { id: documentId },
        { documentId },
        { documentId: normalizedDocId },
        { documentId: { endsWith: `#${normalizedDocId}` } },
      ],
    },
  });

  if (!localDoc) {
    throw new Error("Knowledge document not found");
  }

  const knowledgeBaseId = process.env.DID_KNOWLEDGE_BASE_ID ?? "";

  if (enabled) {
    if (!knowledgeBaseId) {
      throw new Error("DID_KNOWLEDGE_BASE_ID is missing");
    }

    const documentUrl = localDoc.documentUrl;
    if (!documentUrl) {
      throw new Error("Document URL is missing");
    }
    const normalizedTitle = localDoc.title?.trim() ?? "";
    let title = normalizedTitle || localDoc.source;
    if (
      localDoc.source === textBlogSource &&
      (!normalizedTitle ||
        normalizedTitle.toLowerCase() === textBlogSource.toLowerCase())
    ) {
      const partNumber = await prisma.knowledgeDocuments.count({
        where: {
          source: { equals: textBlogSource, mode: "insensitive" },
          createdAt: { lte: localDoc.createdAt },
        },
      });
      title = `Text Blog (Part #${Math.max(partNumber, 1)})`;
    }

    const baseUrl = await resolveBaseUrl();
    const webhookUrl = `${baseUrl}/api/webhooks/did/knowledge`;
    const created = await withDidLogging("Create Knowledge Document", () =>
      didService.createKnowledgeDocument(knowledgeBaseId, {
        documentType: "text",
        source_url: documentUrl,
        title,
        webhook: webhookUrl,
      }),
    );

    const newDocId =
      (created as Record<string, unknown>)?.id ??
      (created as Record<string, unknown>)?.document_id ??
      (created as Record<string, unknown>)?.documentId;
    if (!newDocId) {
      throw new Error("D-ID did not return document id");
    }

    await prisma.knowledgeDocuments.update({
      where: { id: localDoc.id },
      data: {
        documentId: String(newDocId),
        title,
        status: "PROCESSING",
        isEnabled: true,
      },
    });

    if (localDoc.source === manualTrainingSource) {
      await prisma.appSetting.upsert({
        where: { key: manualTrainingDocKey },
        update: { value: String(newDocId) },
        create: { key: manualTrainingDocKey, value: String(newDocId) },
      });
    }
  } else {
    const localDidDocumentId = localDoc.documentId;
    if (knowledgeBaseId && localDidDocumentId) {
      await withDidLogging("Delete Knowledge Document", () =>
        didService.deleteKnowledgeDocument(knowledgeBaseId, localDidDocumentId),
      ).catch(() => undefined);
    }

    await prisma.knowledgeDocuments.update({
      where: { id: localDoc.id },
      data: { isEnabled: false },
    });

    if (localDoc.source === manualTrainingSource) {
      await prisma.appSetting.deleteMany({
        where: { key: manualTrainingDocKey },
      });
    }
  }

  if (localDoc.source === textBlogSource) {
    await updateExternalSourceDocIds("TEXT");
  }
  if (localDoc.source === videoTranscriptsSource) {
    await updateExternalSourceDocIds("VIDEO");
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
