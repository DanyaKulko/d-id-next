"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { findAgentByKey } from "@/lib/agents/agents.db";
import { prisma } from "@/lib/db/prisma";
import { resolveBaseUrl } from "@/lib/http/base-url";
import { didService } from "@/lib/services/did.service";
import {
  resolveBlogCategoryTitle,
  trainingDocumentTitles,
  trainingLimits,
  trainingSourceLabels,
} from "@/lib/training/knowledge-config";
import {
  defaultPersonalityStyle,
  defaultSafetyRules,
  extractKnowledgeBaseId,
  getString,
  normalizePersonalityStyle,
  requireAdmin,
  updateDidAgentFromRole,
  withDidLogging,
} from "./shared";

const knowledgeUploadRoot = path.join(
  process.cwd(),
  "public",
  "uploads",
  "knowledge",
);

const uploadsRootPrefix = path.normalize(
  `${path.join(process.cwd(), "public", "uploads")}${path.sep}`,
);

const normalizeDidDocumentId = (value: string) =>
  value.includes("#") ? (value.split("#").pop() ?? value) : value;

const revalidateTrainingPaths = () => {
  revalidatePath("/admin/training");
  revalidatePath("/admin/training/archive");
  revalidatePath("/admin/training/manual");
};

const resolveTrainingAgentFromFormData = async (formData: FormData) => {
  const roleKey = getString(formData.get("roleKey")).trim();
  if (!roleKey) {
    throw new Error("Role key is required");
  }

  const agent = await findAgentByKey(roleKey);
  if (!agent) {
    throw new Error("Role not found");
  }

  return agent;
};

const resolveStoredKnowledgeFilePath = (documentUrl?: string | null) => {
  if (!documentUrl) return null;
  const marker =
    ["/uploads/knowledge/", "/uploads/manual-training/"].find((item) =>
      documentUrl.includes(item),
    ) ?? null;
  if (!marker) return null;

  const markerIndex = documentUrl.indexOf(marker);

  const relativePath = documentUrl.slice(markerIndex + 1);
  const absolutePath = path.normalize(
    path.join(process.cwd(), "public", relativePath),
  );
  if (!absolutePath.startsWith(uploadsRootPrefix)) {
    return null;
  }
  return absolutePath;
};

const isManagedKnowledgeUploadFile = (absolutePath: string) => {
  const fileName = path.basename(absolutePath).toLowerCase();
  return (
    fileName.startsWith("manual-") ||
    fileName.startsWith("knowledge-") ||
    fileName.startsWith("manual-file-")
  );
};

const removeManagedKnowledgeFile = async (documentUrl?: string | null) => {
  const absolutePath = resolveStoredKnowledgeFilePath(documentUrl);
  if (!absolutePath) return;
  if (!isManagedKnowledgeUploadFile(absolutePath)) return;
  await unlink(absolutePath).catch(() => undefined);
};

const resolveAgentKnowledgeBaseId = async (agent: {
  id: string;
  agentId: string | null;
  displayName: string;
  knowledgeBaseId: string | null;
}) => {
  const localKnowledgeBaseId = agent.knowledgeBaseId?.trim();
  if (localKnowledgeBaseId) {
    return localKnowledgeBaseId;
  }

  if (!agent.agentId) {
    throw new Error("D-ID agent id is missing");
  }

  const didAgentRaw = await withDidLogging("Get Agent", () =>
    didService.getAgent(agent.agentId as string),
  );
  const didAgent =
    didAgentRaw && typeof didAgentRaw === "object"
      ? (didAgentRaw as Record<string, unknown>)
      : null;

  const remoteKnowledgeBaseId = didAgent
    ? extractKnowledgeBaseId(didAgent)
    : "";
  if (remoteKnowledgeBaseId) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { knowledgeBaseId: remoteKnowledgeBaseId },
    });
    return remoteKnowledgeBaseId;
  }

  const createdKnowledgeBase = await withDidLogging(
    "Create Knowledge Base",
    () =>
      didService.createKnowledgeBase({
        name: `${agent.displayName} knowledge`,
      }),
  );

  const createdKnowledgeBaseId = String(
    (createdKnowledgeBase as Record<string, unknown>)?.id ??
      (createdKnowledgeBase as Record<string, unknown>)?.knowledge_id ??
      (createdKnowledgeBase as Record<string, unknown>)?.knowledgeId ??
      "",
  ).trim();

  if (!createdKnowledgeBaseId) {
    throw new Error("D-ID did not return knowledge base id");
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: { knowledgeBaseId: createdKnowledgeBaseId },
  });

  await withDidLogging("Attach Knowledge Base", () =>
    didService.updateAgent(agent.agentId as string, {
      knowledge: { id: createdKnowledgeBaseId },
    }),
  );

  return createdKnowledgeBaseId;
};

const ensureDidAgentKnowledgeBaseId = async (
  agent: { agentId: string | null },
  knowledgeBaseId: string,
) => {
  if (!agent.agentId) return;
  await withDidLogging("Attach Knowledge Base", () =>
    didService.updateAgent(agent.agentId as string, {
      knowledge: { id: knowledgeBaseId },
    }),
  );
};

const writeManualTrainingFile = async (agentId: string, text: string) => {
  await mkdir(knowledgeUploadRoot, { recursive: true });
  const filename = `manual-${agentId}-${Date.now()}-${randomUUID()}.txt`;
  const filePath = path.join(knowledgeUploadRoot, filename);
  await writeFile(filePath, text, "utf8");

  return {
    filePath,
    publicPath: `/uploads/knowledge/${filename}`,
  };
};

const readUploadedManualFiles = async (formData: FormData) => {
  const uploaded = formData.getAll("manualFiles");
  const files: { name: string; text: string }[] = [];

  for (const entry of uploaded) {
    if (!(entry instanceof File)) continue;
    if (entry.size <= 0) continue;

    const name = entry.name?.trim() ?? "";
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (extension !== "txt" && extension !== "md") {
      throw new Error(`Unsupported file format: ${name}`);
    }

    const content = (await entry.text()).trim();
    if (!content) {
      throw new Error(`Uploaded file is empty: ${name}`);
    }
    files.push({ name, text: content });
  }

  if (files.length > 1) {
    throw new Error("Only one manual file is allowed");
  }

  return files[0] ?? null;
};

const normalizeManualKnowledgeText = (value: string) => {
  return value
    .replace(/\uFEFF/g, "")
    .replace(/вЂ—|вЂ”|â€”|Ђ—|Ђ”|—|–/g, "-")
    .replace(/вЂ“|â€“|Ђ“/g, "-")
    .replace(/вЂ¦|â€¦|Ђ¦|…/g, "...")
    .replace(/вЂњ|вЂќ|â€œ|â€|Ђњ|Ђќ/g, '"')
    .replace(/вЂ˜|вЂ™|â€˜|â€™|Ђ˜|Ђ™|Ђљ/g, "'")
    .replace(/[“”«»„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/Â/g, " ");
};

const resolveBaseKnowledgeText = async (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (!/^https?:\/\//i.test(trimmed)) {
    return normalizeManualKnowledgeText(trimmed);
  }

  const response = await fetch(trimmed, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load base knowledge file");
  }

  const text = normalizeManualKnowledgeText(await response.text()).trim();
  if (!text) {
    throw new Error("Base knowledge file is empty");
  }

  return text;
};

const buildManualTrainingPayload = (
  manualText: string,
  uploadedFile: { name: string; text: string } | null,
  baseKnowledge = "",
) => {
  const normalizedManualText = normalizeManualKnowledgeText(manualText).trim();
  const normalizedFileText = uploadedFile
    ? normalizeManualKnowledgeText(uploadedFile.text).trim()
    : "";

  const manualParts: string[] = [];
  if (normalizedManualText) {
    manualParts.push(normalizedManualText);
  }
  if (uploadedFile && normalizedFileText) {
    manualParts.push(`## File: ${uploadedFile.name}\n\n${normalizedFileText}`);
  }

  const manualPayload = manualParts.join("\n\n").trim();
  if (manualPayload.length > trainingLimits.manualTrainingCharLimit) {
    throw new Error(
      `Manual training cannot exceed ${trainingLimits.manualTrainingCharLimit} characters`,
    );
  }

  const trimmedBaseKnowledge = baseKnowledge.trim();
  if (
    trimmedBaseKnowledge.length > trainingLimits.fundamentalBriefReserveChars
  ) {
    throw new Error(
      `Base knowledge cannot exceed ${trainingLimits.fundamentalBriefReserveChars} characters`,
    );
  }

  if (!manualPayload && !trimmedBaseKnowledge) {
    throw new Error("Manual training text or base knowledge are required");
  }

  const fullPayload =
    trimmedBaseKnowledge && !manualPayload.includes(trimmedBaseKnowledge)
      ? [trimmedBaseKnowledge, manualPayload].join("\n\n")
      : manualPayload;

  const combinedManualLimit =
    trainingLimits.fundamentalBriefReserveChars +
    trainingLimits.manualTrainingCharLimit;

  if (fullPayload.length > combinedManualLimit) {
    throw new Error(
      `Combined fundamental and manual training cannot exceed ${combinedManualLimit} characters`,
    );
  }

  return {
    manualPayload,
    fullPayload,
  };
};

export async function saveSafetyInstructionsAction(formData: FormData) {
  await requireAdmin();
  const roleKey = getString(formData.get("roleKey")).trim();
  const agent = await resolveTrainingAgentFromFormData(formData);
  const safetyRules = getString(formData.get("safetyRules")).trim();
  if (!safetyRules) {
    throw new Error("Safety rules cannot be empty");
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: { safetyRules },
  });

  if (agent.agentId) {
    await updateDidAgentFromRole(agent.agentId, {
      name: agent.name,
      description: agent.description ?? "",
      role: agent.roleDescription ?? "",
      systemPrompt: agent.instructions ?? "",
      safetyRules: safetyRules || defaultSafetyRules,
      personalityStyle: normalizePersonalityStyle(
        agent.personality ?? defaultPersonalityStyle,
      ),
      voiceId: agent.voiceID ?? "",
      knowledgeBaseId: agent.knowledgeBaseId ?? undefined,
    });
  }

  revalidatePath("/admin/training");
  revalidatePath("/admin/training/safety");
  if (roleKey) {
    revalidatePath(
      `/admin/training/safety?role=${encodeURIComponent(roleKey)}`,
    );
  }
  return { ok: true };
}

export async function saveManualTrainingAction(formData: FormData) {
  await requireAdmin();
  const agent = await resolveTrainingAgentFromFormData(formData);
  const manualSettings = await prisma.agentTrainingManual.findUnique({
    where: { agentId: agent.id },
    select: { baseKnowledge: true, manualText: true },
  });
  const baseKnowledgeSetting = (manualSettings?.baseKnowledge ?? "").trim();
  const isBaseKnowledgeUrl = /^https?:\/\//i.test(baseKnowledgeSetting);
  const manualText = getString(formData.get("manualLearning")).trim();
  const uploadedFile = await readUploadedManualFiles(formData);
  const existingManualFileName = getString(
    formData.get("existingManualFileName"),
  ).trim();
  const existingManualFileContent = getString(
    formData.get("existingManualFileContent"),
  ).trim();
  const removeExistingManualFile =
    getString(formData.get("removeExistingManualFile")).trim() === "true";
  const persistedManualFile =
    !removeExistingManualFile &&
    existingManualFileName &&
    existingManualFileContent
      ? {
          name: existingManualFileName,
          text: existingManualFileContent,
        }
      : null;
  const effectiveManualFile = uploadedFile ?? persistedManualFile;
  const hasManualDocumentInput =
    manualText.length > 0 ||
    Boolean(effectiveManualFile) ||
    baseKnowledgeSetting.length > 0;

  let manualPayload = "";
  let fullPayload = "";

  if (!hasManualDocumentInput) {
    manualPayload = "";
    fullPayload = "";
  } else if (
    isBaseKnowledgeUrl &&
    manualText.length === 0 &&
    !effectiveManualFile
  ) {
    // Keep base knowledge as direct URL without generating a local merged file.
    manualPayload = "";
    fullPayload = "";
  } else {
    const baseKnowledge = await resolveBaseKnowledgeText(baseKnowledgeSetting);
    const builtPayload = buildManualTrainingPayload(
      manualText,
      effectiveManualFile,
      baseKnowledge,
    );
    manualPayload = builtPayload.manualPayload;
    fullPayload = builtPayload.fullPayload;
  }

  const previousManualText = (manualSettings?.manualText ?? "").trim();
  const manualTextChanged = manualPayload !== previousManualText;

  await prisma.agentTrainingManual.upsert({
    where: { agentId: agent.id },
    update: { manualText: manualPayload },
    create: {
      agentId: agent.id,
      baseKnowledge: baseKnowledgeSetting,
      manualText: manualPayload,
    },
  });

  const knowledgeBaseId = await resolveAgentKnowledgeBaseId(agent);
  await ensureDidAgentKnowledgeBaseId(agent, knowledgeBaseId);
  const baseUrl = await resolveBaseUrl();

  const existingManualDocs = await prisma.knowledgeDocuments.findMany({
    where: {
      agentId: agent.id,
      source: { equals: trainingSourceLabels.manual, mode: "insensitive" },
    },
    orderBy: { updatedAt: "desc" },
  });

  const primaryManualDoc = existingManualDocs[0] ?? null;
  const isDirectBaseUrlMode =
    isBaseKnowledgeUrl && manualText.length === 0 && !effectiveManualFile;
  const expectedManualDocumentCharCount =
    hasManualDocumentInput && !isDirectBaseUrlMode ? fullPayload.length : 0;

  const shouldDeleteManualDoc =
    !hasManualDocumentInput && Boolean(primaryManualDoc);
  const shouldResyncBaseUrlDoc =
    isDirectBaseUrlMode &&
    manualPayload.length === 0 &&
    baseKnowledgeSetting.length > 0 &&
    (primaryManualDoc?.documentUrl !== baseKnowledgeSetting ||
      primaryManualDoc?.charCount !== 0);
  const shouldResyncGeneratedDocByCharCount =
    hasManualDocumentInput &&
    !isDirectBaseUrlMode &&
    primaryManualDoc?.charCount !== expectedManualDocumentCharCount;
  const shouldSyncManualDocument =
    hasManualDocumentInput &&
    (manualTextChanged ||
      shouldResyncBaseUrlDoc ||
      shouldResyncGeneratedDocByCharCount ||
      !primaryManualDoc ||
      !primaryManualDoc.documentId ||
      !primaryManualDoc.isEnabled ||
      primaryManualDoc.status === "FAILED");

  const webhookUrl = `${baseUrl}/api/webhooks/did/knowledge`;

  if (shouldDeleteManualDoc && primaryManualDoc) {
    if (primaryManualDoc.documentId) {
      await withDidLogging("Delete Knowledge Document", () =>
        didService.deleteKnowledgeDocument(
          knowledgeBaseId,
          primaryManualDoc.documentId as string,
        ),
      ).catch(() => undefined);
    }

    await removeManagedKnowledgeFile(primaryManualDoc.documentUrl);
    await prisma.processedPost.updateMany({
      where: { knowledgeDocumentId: primaryManualDoc.id },
      data: { knowledgeDocumentId: null },
    });
    await prisma.knowledgeDocuments.delete({
      where: { id: primaryManualDoc.id },
    });
  }

  if (shouldSyncManualDocument) {
    let sourceUrlForDid = "";
    let manualDocumentUrl = "";
    let manualDocumentCharCount = 0;
    let generatedManualFilePath: string | null = null;

    if (isBaseKnowledgeUrl && !manualPayload) {
      sourceUrlForDid = baseKnowledgeSetting;
      manualDocumentUrl = baseKnowledgeSetting;
      manualDocumentCharCount = 0;
    } else {
      const { filePath, publicPath } = await writeManualTrainingFile(
        agent.id,
        fullPayload,
      );
      generatedManualFilePath = filePath;
      sourceUrlForDid = `${baseUrl}${publicPath}`;
      manualDocumentUrl = sourceUrlForDid;
      manualDocumentCharCount = fullPayload.length;
    }

    if (!sourceUrlForDid) {
      throw new Error("Manual training source is empty");
    }

    const created = await withDidLogging("Create Knowledge Document", () =>
      didService
        .createKnowledgeDocument(knowledgeBaseId, {
          documentType: "text",
          source_url: sourceUrlForDid,
          title: trainingDocumentTitles.manualKnowledge,
          webhook: webhookUrl,
        })
        .catch(async (error) => {
          if (generatedManualFilePath) {
            await unlink(generatedManualFilePath).catch(() => undefined);
          }
          throw error;
        }),
    );

    const createdDocumentId = String(
      (created as Record<string, unknown>)?.id ??
        (created as Record<string, unknown>)?.document_id ??
        (created as Record<string, unknown>)?.documentId ??
        "",
    ).trim();

    if (!createdDocumentId) {
      if (generatedManualFilePath) {
        await unlink(generatedManualFilePath).catch(() => undefined);
      }
      throw new Error("D-ID did not return document id");
    }

    const previousDidDocumentId = primaryManualDoc?.documentId?.trim() ?? "";
    const previousDocumentUrl = primaryManualDoc?.documentUrl ?? null;

    if (primaryManualDoc) {
      await prisma.knowledgeDocuments.update({
        where: { id: primaryManualDoc.id },
        data: {
          source: trainingSourceLabels.manual,
          title: trainingDocumentTitles.manualKnowledge,
          documentId: createdDocumentId,
          documentUrl: manualDocumentUrl,
          status: "PROCESSING",
          isEnabled: true,
          charCount: manualDocumentCharCount,
          isFull: false,
          categoryId: null,
        },
      });
    } else {
      await prisma.knowledgeDocuments.create({
        data: {
          agentId: agent.id,
          source: trainingSourceLabels.manual,
          title: trainingDocumentTitles.manualKnowledge,
          documentId: createdDocumentId,
          documentUrl: manualDocumentUrl,
          status: "PROCESSING",
          isEnabled: true,
          charCount: manualDocumentCharCount,
          isFull: false,
          categoryId: null,
        },
      });
    }

    if (
      previousDidDocumentId &&
      normalizeDidDocumentId(previousDidDocumentId) !==
        normalizeDidDocumentId(createdDocumentId)
    ) {
      await withDidLogging("Delete Knowledge Document", () =>
        didService.deleteKnowledgeDocument(
          knowledgeBaseId,
          previousDidDocumentId,
        ),
      ).catch(() => undefined);
    }

    if (previousDocumentUrl && previousDocumentUrl !== manualDocumentUrl) {
      await removeManagedKnowledgeFile(previousDocumentUrl);
    }
  }

  const legacyManualFileDocs = await prisma.knowledgeDocuments.findMany({
    where: {
      agentId: agent.id,
      source: { equals: trainingSourceLabels.manualFile, mode: "insensitive" },
    },
    select: {
      id: true,
      documentId: true,
      documentUrl: true,
    },
  });
  if (legacyManualFileDocs.length > 0) {
    for (const legacyDoc of legacyManualFileDocs) {
      if (legacyDoc.documentId) {
        await withDidLogging("Delete Knowledge Document", () =>
          didService.deleteKnowledgeDocument(
            knowledgeBaseId,
            legacyDoc.documentId as string,
          ),
        ).catch(() => undefined);
      }
      await removeManagedKnowledgeFile(legacyDoc.documentUrl);
    }

    await prisma.processedPost.updateMany({
      where: {
        knowledgeDocumentId: { in: legacyManualFileDocs.map((doc) => doc.id) },
      },
      data: { knowledgeDocumentId: null },
    });
    await prisma.knowledgeDocuments.deleteMany({
      where: { id: { in: legacyManualFileDocs.map((doc) => doc.id) } },
    });
  }

  const manualDocsForCleanup = await prisma.knowledgeDocuments.findMany({
    where: {
      agentId: agent.id,
      source: { equals: trainingSourceLabels.manual, mode: "insensitive" },
    },
    orderBy: { updatedAt: "desc" },
  });
  const docsToCleanup = shouldDeleteManualDoc
    ? manualDocsForCleanup
    : manualDocsForCleanup.slice(1);
  const docsToCleanupIds = docsToCleanup.map((doc) => doc.id);

  if (docsToCleanupIds.length > 0) {
    for (const doc of docsToCleanup) {
      if (doc.documentId) {
        await withDidLogging("Delete Knowledge Document", () =>
          didService.deleteKnowledgeDocument(
            knowledgeBaseId,
            doc.documentId as string,
          ),
        ).catch(() => undefined);
      }
      await removeManagedKnowledgeFile(doc.documentUrl);
    }

    await prisma.processedPost.updateMany({
      where: { knowledgeDocumentId: { in: docsToCleanupIds } },
      data: { knowledgeDocumentId: null },
    });
    await prisma.knowledgeDocuments.deleteMany({
      where: { id: { in: docsToCleanupIds } },
    });
  }

  revalidateTrainingPaths();
  return { ok: true, manualText: manualPayload };
}

export async function toggleTextBlogKnowledgeAction(formData: FormData) {
  await requireAdmin();
  const agent = await resolveTrainingAgentFromFormData(formData);
  const enabled = getString(formData.get("enabled")).trim() === "true";

  await prisma.agent.update({
    where: { id: agent.id },
    data: { blogKnowledgeEnabled: enabled },
  });

  const docs = await prisma.knowledgeDocuments.findMany({
    where: {
      agentId: agent.id,
      source: { equals: trainingSourceLabels.textBlog, mode: "insensitive" },
    },
    orderBy: [{ categoryId: "asc" }, { createdAt: "asc" }],
  });

  if (!enabled) {
    if (agent.knowledgeBaseId) {
      for (const doc of docs) {
        if (!doc.documentId) continue;
        await withDidLogging("Delete Knowledge Document", () =>
          didService.deleteKnowledgeDocument(
            agent.knowledgeBaseId as string,
            doc.documentId as string,
          ),
        ).catch(() => undefined);
      }
    }

    await prisma.knowledgeDocuments.updateMany({
      where: {
        agentId: agent.id,
        source: { equals: trainingSourceLabels.textBlog, mode: "insensitive" },
      },
      data: { isEnabled: false },
    });

    revalidateTrainingPaths();
    return { ok: true, enabled };
  }

  if (docs.length === 0) {
    revalidateTrainingPaths();
    return { ok: true, enabled };
  }

  const knowledgeBaseId = await resolveAgentKnowledgeBaseId(agent);
  await ensureDidAgentKnowledgeBaseId(agent, knowledgeBaseId);
  const baseUrl = await resolveBaseUrl();
  const webhookUrl = `${baseUrl}/api/webhooks/did/knowledge`;

  for (const doc of docs) {
    if (doc.isEnabled) continue;
    const sourceUrl = doc.documentUrl;
    if (!sourceUrl) {
      await prisma.knowledgeDocuments.update({
        where: { id: doc.id },
        data: { status: "FAILED" },
      });
      continue;
    }

    const title =
      doc.title?.trim() ||
      resolveBlogCategoryTitle(doc.categoryId ?? -1) ||
      `${trainingSourceLabels.textBlog} #${doc.id.slice(0, 8)}`;

    const created = await withDidLogging("Create Knowledge Document", () =>
      didService.createKnowledgeDocument(knowledgeBaseId, {
        documentType: "text",
        source_url: sourceUrl,
        title,
        webhook: webhookUrl,
      }),
    );

    const newDocumentId = String(
      (created as Record<string, unknown>)?.id ??
        (created as Record<string, unknown>)?.document_id ??
        (created as Record<string, unknown>)?.documentId ??
        "",
    ).trim();

    if (!newDocumentId) {
      throw new Error("D-ID did not return document id");
    }

    await prisma.knowledgeDocuments.update({
      where: { id: doc.id },
      data: {
        documentId: newDocumentId,
        title,
        status: "PROCESSING",
        isEnabled: true,
      },
    });
  }

  revalidateTrainingPaths();
  return { ok: true, enabled };
}

export async function deleteKnowledgeDocumentAction(formData: FormData) {
  await requireAdmin();
  const agent = await resolveTrainingAgentFromFormData(formData);
  const documentId = getString(formData.get("documentId")).trim();
  if (!documentId) {
    throw new Error("Document id is required");
  }

  const localDocs = await prisma.knowledgeDocuments.findMany({
    where: {
      agentId: agent.id,
      OR: [
        { id: documentId },
        { documentId },
        { documentId: normalizeDidDocumentId(documentId) },
        { documentId: { endsWith: `#${normalizeDidDocumentId(documentId)}` } },
      ],
    },
    select: {
      id: true,
      source: true,
      categoryId: true,
      documentId: true,
      documentUrl: true,
    },
  });

  const didDocumentIdsToDelete = new Set<string>();
  didDocumentIdsToDelete.add(documentId);
  didDocumentIdsToDelete.add(normalizeDidDocumentId(documentId));

  for (const doc of localDocs) {
    if (!doc.documentId) continue;
    didDocumentIdsToDelete.add(doc.documentId);
    didDocumentIdsToDelete.add(normalizeDidDocumentId(doc.documentId));
  }

  if (agent.knowledgeBaseId) {
    for (const didDocumentId of didDocumentIdsToDelete) {
      await withDidLogging("Delete Knowledge Document", () =>
        didService.deleteKnowledgeDocument(
          agent.knowledgeBaseId as string,
          didDocumentId,
        ),
      ).catch(() => undefined);
    }
  }

  if (localDocs.length > 0) {
    const localIds = localDocs.map((doc) => doc.id);
    await prisma.processedPost.updateMany({
      where: { knowledgeDocumentId: { in: localIds } },
      data: { knowledgeDocumentId: null },
    });

    const removedBlogCategoryIds = Array.from(
      new Set(
        localDocs
          .filter(
            (doc) =>
              doc.source.trim().toLowerCase() ===
                trainingSourceLabels.textBlog.toLowerCase() &&
              typeof doc.categoryId === "number",
          )
          .map((doc) => doc.categoryId as number),
      ),
    );
    if (removedBlogCategoryIds.length > 0) {
      await prisma.processedPost.updateMany({
        where: {
          agentId: agent.id,
          categoryId: { in: removedBlogCategoryIds },
        },
        data: {
          content: "",
          charCount: 0,
          knowledgeDocumentId: null,
        },
      });
    }

    await prisma.knowledgeDocuments.deleteMany({
      where: { id: { in: localIds } },
    });

    for (const doc of localDocs) {
      await removeManagedKnowledgeFile(doc.documentUrl);
    }
  }

  revalidateTrainingPaths();
  return { ok: true };
}

export async function toggleKnowledgeDocumentEnabledAction(formData: FormData) {
  await requireAdmin();
  const agent = await resolveTrainingAgentFromFormData(formData);
  const documentId = getString(formData.get("documentId")).trim();
  const enabled = getString(formData.get("enabled")).trim() === "true";

  if (!documentId) {
    throw new Error("Document id is required");
  }

  const normalizedDocId = normalizeDidDocumentId(documentId);
  const localDoc = await prisma.knowledgeDocuments.findFirst({
    where: {
      agentId: agent.id,
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

  if (enabled) {
    const sourceUrl = localDoc.documentUrl;
    if (!sourceUrl) {
      throw new Error("Document URL is missing");
    }

    const knowledgeBaseId = await resolveAgentKnowledgeBaseId(agent);
    await ensureDidAgentKnowledgeBaseId(agent, knowledgeBaseId);
    const baseUrl = await resolveBaseUrl();
    const webhookUrl = `${baseUrl}/api/webhooks/did/knowledge`;
    const title =
      localDoc.title?.trim() ||
      resolveBlogCategoryTitle(localDoc.categoryId ?? -1) ||
      localDoc.source;

    const created = await withDidLogging("Create Knowledge Document", () =>
      didService.createKnowledgeDocument(knowledgeBaseId, {
        documentType: "text",
        source_url: sourceUrl,
        title,
        webhook: webhookUrl,
      }),
    );

    const newDocumentId = String(
      (created as Record<string, unknown>)?.id ??
        (created as Record<string, unknown>)?.document_id ??
        (created as Record<string, unknown>)?.documentId ??
        "",
    ).trim();

    if (!newDocumentId) {
      throw new Error("D-ID did not return document id");
    }

    await prisma.knowledgeDocuments.update({
      where: { id: localDoc.id },
      data: {
        documentId: newDocumentId,
        title,
        status: "PROCESSING",
        isEnabled: true,
      },
    });
  } else {
    if (agent.knowledgeBaseId && localDoc.documentId) {
      await withDidLogging("Delete Knowledge Document", () =>
        didService.deleteKnowledgeDocument(
          agent.knowledgeBaseId as string,
          localDoc.documentId as string,
        ),
      ).catch(() => undefined);
    }

    await prisma.knowledgeDocuments.update({
      where: { id: localDoc.id },
      data: { isEnabled: false },
    });
  }

  revalidateTrainingPaths();

  return {
    ok: true,
    enabled,
    status: enabled ? "processing" : undefined,
  };
}
