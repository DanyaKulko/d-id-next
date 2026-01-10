"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
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

  revalidatePath("/admin/training");
  revalidatePath("/admin/training/archive");
  return { ok: true };
}
