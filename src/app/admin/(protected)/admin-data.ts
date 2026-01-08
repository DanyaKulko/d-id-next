"use server";

import { prisma } from "@/lib/db/prisma";
import { externalSourcesSeeds } from "@/lib/external-sources/config";
import { didService } from "@/lib/services/did.service";

export type UserRow = {
  id: string;
  login: string;
  email: string;
  createdDate: string;
  lastLogin: string;
  status: "active" | "inactive";
};

export type KnowledgeItem = {
  id: string;
  title: string;
  sourceLabel: string;
  created: string;
  status: "processing" | "error" | "active";
  url?: string;
};

const safetyRulesKey = "safetyRules";
const manualTrainingKey = "manualTrainingText";
const manualTrainingDocKey = "manualTrainingDocId";
const authRequiredKey = "requireAuthentication";
const manualTrainingSource = "Manual training";
const textBlogSource = "Text blog";
const videoTranscriptsSource = "Video transcripts";
const defaultSafetyRules = `Do not discuss:
- Political topics in aggressive form
- Personal information of third parties
- Financial advice as actionable recommendations

Always:
- Maintain a respectful tone
- Avoid categorical judgments
- Reference sources for factual claims`;

const normalizeDidDocumentId = (value: string) =>
  value.includes("#") ? (value.split("#").pop() ?? value) : value;

const matchesDidDocumentId = (value: string, candidate: string) =>
  value === candidate ||
  normalizeDidDocumentId(value) === normalizeDidDocumentId(candidate);

export async function fetchUsers(): Promise<UserRow[]> {
  const users = await prisma.user.findMany({
    where: {
      roles: { none: { role: "ADMIN" } },
    },
    select: {
      id: true,
      email: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (users.length === 0) return [];

  const loginEvents = await prisma.loginEvent.findMany({
    where: {
      userId: { in: users.map((user) => user.id) },
      success: true,
      type: "LOGIN_PASSWORD",
    },
    orderBy: { createdAt: "desc" },
    select: { userId: true, createdAt: true },
  });

  const lastLoginMap = new Map<string, string>();
  for (const event of loginEvents) {
    if (!event.userId || lastLoginMap.has(event.userId)) continue;
    lastLoginMap.set(event.userId, event.createdAt.toISOString().split("T")[0]);
  }

  return users.map((user) => ({
    id: user.id,
    login: user.email.split("@")[0] ?? user.email,
    email: user.email,
    createdDate: user.createdAt.toISOString().split("T")[0],
    lastLogin: lastLoginMap.get(user.id) ?? "Never",
    status: user.isActive ? "active" : "inactive",
  }));
}

export async function fetchKnowledgeArchive(): Promise<KnowledgeItem[]> {
  const knowledgeBaseId = process.env.DID_KNOWLEDGE_BASE_ID ?? "";
  const [manualDoc, externalSources] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: manualTrainingDocKey } }),
    prisma.externalSource.findMany(),
  ]);

  const textSource = externalSources.find((item) => item.kind === "TEXT");
  const videoSource = externalSources.find((item) => item.kind === "VIDEO");

  const knownDocIdMap = new Map<string, string>();
  const registerDocId = (docId: string, label: string) => {
    knownDocIdMap.set(docId, label);
    knownDocIdMap.set(normalizeDidDocumentId(docId), label);
  };
  if (manualDoc?.value) {
    registerDocId(manualDoc.value, manualTrainingSource);
  }
  if (textSource?.documentId) {
    registerDocId(textSource.documentId, textBlogSource);
  }
  if (videoSource?.documentId) {
    registerDocId(videoSource.documentId, videoTranscriptsSource);
  }

  const expectedDocIdBySourceKey = new Map<string, string>();
  if (manualDoc?.value) {
    expectedDocIdBySourceKey.set(
      manualTrainingSource.toLowerCase(),
      manualDoc.value,
    );
  }
  if (textSource?.documentId) {
    expectedDocIdBySourceKey.set(
      textBlogSource.toLowerCase(),
      textSource.documentId,
    );
  }
  if (videoSource?.documentId) {
    expectedDocIdBySourceKey.set(
      videoTranscriptsSource.toLowerCase(),
      videoSource.documentId,
    );
  }

  const cleanupKnownSources = async () => {
    const manualDocIds = manualDoc?.value
      ? [manualDoc.value, normalizeDidDocumentId(manualDoc.value)]
      : [];
    const textDocIds = textSource?.documentId
      ? [textSource.documentId, normalizeDidDocumentId(textSource.documentId)]
      : [];
    const videoDocIds = videoSource?.documentId
      ? [videoSource.documentId, normalizeDidDocumentId(videoSource.documentId)]
      : [];

    if (manualDocIds.length > 0) {
      await prisma.knowledgeDocuments.deleteMany({
        where: {
          source: { equals: manualTrainingSource, mode: "insensitive" },
          documentId: { notIn: manualDocIds },
        },
      });
    }
    if (textDocIds.length > 0) {
      await prisma.knowledgeDocuments.deleteMany({
        where: {
          source: { equals: textBlogSource, mode: "insensitive" },
          documentId: { notIn: textDocIds },
        },
      });
    }
    if (videoDocIds.length > 0) {
      await prisma.knowledgeDocuments.deleteMany({
        where: {
          source: { equals: videoTranscriptsSource, mode: "insensitive" },
          documentId: { notIn: videoDocIds },
        },
      });
    }
  };
  if (!knowledgeBaseId) {
    await cleanupKnownSources();
    const localDocs = await prisma.knowledgeDocuments.findMany({
      orderBy: { createdAt: "desc" },
    });
    return localDocs.map((doc) => ({
      id: doc.documentId ?? doc.id,
      title: doc.source,
      sourceLabel: doc.source,
      created: doc.createdAt.toISOString().split("T")[0],
      status:
        doc.status === "READY"
          ? "active"
          : doc.status === "FAILED"
            ? "error"
            : "processing",
      url: doc.documentUrl ?? undefined,
    }));
  }

  try {
    const documents = await didService.listKnowledgeDocuments(knowledgeBaseId);
    const documentList = Array.isArray(documents) ? documents : [];
    const documentIds = documentList
      .map((doc) => String(doc.id ?? doc.document_id ?? doc.documentId ?? ""))
      .filter((id) => id);
    const normalizedDocumentIds = documentIds.map((id) =>
      normalizeDidDocumentId(id),
    );
    const queryDocumentIds = Array.from(
      new Set([...documentIds, ...normalizedDocumentIds]),
    );
    const localDocs = queryDocumentIds.length
      ? await prisma.knowledgeDocuments.findMany({
          where: { documentId: { in: queryDocumentIds } },
        })
      : [];
    const localMap = new Map<string, (typeof localDocs)[number]>();
    for (const doc of localDocs) {
      if (!doc.documentId) continue;
      localMap.set(doc.documentId, doc);
      localMap.set(normalizeDidDocumentId(doc.documentId), doc);
    }

    const statusMap: Record<string, KnowledgeItem["status"]> = {
      processing: "processing",
      queued: "processing",
      failed: "error",
      error: "error",
      done: "active",
      ready: "active",
      completed: "active",
      active: "active",
    };

    const mapped = documentList
      .map((doc) => {
        const docId = String(doc.id ?? doc.document_id ?? doc.documentId);
        const local = localMap.get(docId);
        const titleRaw = String(doc.title ?? doc.name ?? "").trim();
        const titleKey = titleRaw.toLowerCase();
        const labelFromId =
          knownDocIdMap.get(docId) ??
          knownDocIdMap.get(normalizeDidDocumentId(docId));
        const labelFromTitle =
          titleKey === manualTrainingSource.toLowerCase()
            ? manualTrainingSource
            : titleKey === textBlogSource.toLowerCase()
              ? textBlogSource
              : titleKey === videoTranscriptsSource.toLowerCase()
                ? videoTranscriptsSource
                : undefined;
        const expectedDocId = expectedDocIdBySourceKey.get(titleKey);

        if (expectedDocId && !matchesDidDocumentId(docId, expectedDocId)) {
          return null;
        }

        const sourceLabel =
          labelFromId ??
          labelFromTitle ??
          doc.source ??
          local?.source ??
          "Knowledge";

        return {
          id: docId,
          title:
            titleRaw || local?.source || sourceLabel || "Knowledge Document",
          sourceLabel,
          created: doc.created_at
            ? new Date(doc.created_at).toISOString().split("T")[0]
            : "",
          status:
            statusMap[String(doc.status ?? "").toLowerCase()] ?? "processing",
          url:
            local?.documentUrl ??
            doc.url ??
            doc.document_url ??
            doc.documentUrl,
        };
      })
      .filter((item): item is KnowledgeItem => Boolean(item));

    const extraLocal = await prisma.knowledgeDocuments.findMany({
      where: { documentId: { notIn: queryDocumentIds } },
      orderBy: { createdAt: "desc" },
    });

    const extraMapped = extraLocal
      .map((doc) => {
        const sourceKey = doc.source.trim().toLowerCase();
        const expectedDocId = expectedDocIdBySourceKey.get(sourceKey);
        if (
          expectedDocId &&
          doc.documentId &&
          !matchesDidDocumentId(doc.documentId, expectedDocId)
        ) {
          return null;
        }

        return {
          id: doc.documentId ?? doc.id,
          title: doc.source,
          sourceLabel: doc.source,
          created: doc.createdAt.toISOString().split("T")[0],
          status:
            doc.status === "READY"
              ? "active"
              : doc.status === "FAILED"
                ? "error"
                : "processing",
          url: doc.documentUrl ?? undefined,
        };
      })
      .filter((item): item is KnowledgeItem => Boolean(item));

    await cleanupKnownSources();
    const combined = [...mapped, ...extraMapped];
    const dedupeKeys = new Set([
      "manual training",
      "text blog",
      "video transcripts",
    ]);
    const seen = new Set<string>();
    return combined.filter((item) => {
      const key = item.sourceLabel.trim().toLowerCase();
      if (!dedupeKeys.has(key)) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    await cleanupKnownSources();
    const localDocs = await prisma.knowledgeDocuments.findMany({
      orderBy: { createdAt: "desc" },
    });
    return localDocs.map((doc) => ({
      id: doc.documentId ?? doc.id,
      title: doc.source,
      sourceLabel: doc.source,
      created: doc.createdAt.toISOString().split("T")[0],
      status:
        doc.status === "READY"
          ? "active"
          : doc.status === "FAILED"
            ? "error"
            : "processing",
      url: doc.documentUrl ?? undefined,
    }));
  }
}

export async function fetchSafetyInstructions(): Promise<string> {
  const safetySetting = await prisma.appSetting.findUnique({
    where: { key: safetyRulesKey },
  });
  return safetySetting?.value?.trim()
    ? safetySetting.value
    : defaultSafetyRules;
}

export async function fetchManualTrainingTemplate(): Promise<string> {
  const manualSetting = await prisma.appSetting.findUnique({
    where: { key: manualTrainingKey },
  });
  return manualSetting?.value?.trim() ? manualSetting.value : "";
}

const maskCentered = (str: string, unmaskedChars = 4) => {
  if (str.length <= unmaskedChars) return "*".repeat(str.length);
  const maskedLength = str.length - unmaskedChars;
  const start = str.slice(0, Math.ceil(unmaskedChars / 2));
  const end = str.slice(str.length - Math.floor(unmaskedChars / 2));
  return start + "*".repeat(maskedLength) + end;
};

export async function fetchIntegrationConfig() {
  const apiKey = process.env.DID_API_KEY;
  return { apiKey: apiKey ? maskCentered(apiKey, 8) : "" };
}

export async function fetchAuthRequirement(): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: authRequiredKey },
  });
  return setting?.value === "true";
}

export async function fetchExternalSourcesConfig() {
  const sources = await prisma.externalSource.findMany();
  const textSource = sources.find((item) => item.kind === "TEXT");
  const videoSource = sources.find((item) => item.kind === "VIDEO");
  const textSeed = externalSourcesSeeds.find((item) => item.kind === "TEXT");
  const videoSeed = externalSourcesSeeds.find((item) => item.kind === "VIDEO");

  return {
    textLink: textSource?.link ?? textSeed?.link ?? "",
    textCron: textSource?.cron ?? textSeed?.cron ?? "",
    textAccessKey: textSource?.accessKey ?? "",
    videoLink: videoSource?.link ?? videoSeed?.link ?? "",
    videoCron: videoSource?.cron ?? videoSeed?.cron ?? "",
    videoAccessKey: videoSource?.accessKey ?? "",
  };
}
