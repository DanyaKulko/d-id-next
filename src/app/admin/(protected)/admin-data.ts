"use server";

import { prisma } from "@/lib/db/prisma";
import { parseStoredDocumentIds } from "@/lib/external-sources/documents";
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
  url: string | undefined;
};

export type SessionMessageItem = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
};

export type SessionRow = {
  id: string;
  sessionId: string;
  roleName: string;
  language: string;
  device: string;
  messageCount: number;
  startedAt: string;
  messages: SessionMessageItem[];
};

export type SessionRoleOption = {
  id: string;
  name: string;
};

export type SessionFilters = {
  roleId?: string;
  from?: string;
  to?: string;
  language?: string;
  page: number;
  limit: number;
};

export type SessionPage = {
  rows: SessionRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type ErrorLogRow = {
  id: string;
  createdAt: string;
  source: string;
  type: string;
  message: string;
  level: "error" | "warning" | "info";
  metadata?: unknown;
};

export type ErrorLogFilters = {
  page: number;
  limit: number;
};

export type ErrorLogPage = {
  rows: ErrorLogRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

const isCookieLikeValue = (value: string) => {
  const lower = value.toLowerCase();
  if (lower.includes("awsalb") || lower.includes("awsalbcors")) return true;
  if (lower.includes("expires=") || lower.includes("path=")) return true;
  return value.includes(";") || value.includes("=");
};

const resolveSessionIdentifier = (session: {
  didSessionId: string | null;
  didChatId: string;
  didStreamId: string;
  id: string;
}) => {
  const preferred = session.didSessionId?.trim() ?? "";
  if (preferred && !isCookieLikeValue(preferred)) {
    return preferred;
  }
  return session.didChatId || session.didStreamId || session.id;
};

const resolveDeviceLabel = (userAgent?: string | null) => {
  if (!userAgent) return "Unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("mobile")) return "Mobile";
  if (ua.includes("tablet") || ua.includes("ipad")) return "Tablet";
  return "Desktop";
};

const toLocalDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
};

const parseDateRange = (from?: string, to?: string) => {
  const range: { gte?: Date; lte?: Date } = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.valueOf())) {
      start.setHours(0, 0, 0, 0);
      range.gte = start;
    }
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.valueOf())) {
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
  }
  return range;
};

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
  const textDocIds = parseStoredDocumentIds(textSource?.documentId ?? null);
  const videoDocIds = parseStoredDocumentIds(videoSource?.documentId ?? null);

  const knownDocIdMap = new Map<string, string>();
  const registerDocId = (docId: string, label: string) => {
    knownDocIdMap.set(docId, label);
    knownDocIdMap.set(normalizeDidDocumentId(docId), label);
  };
  const registerDocIds = (docIds: string[], label: string) => {
    for (const docId of docIds) {
      registerDocId(docId, label);
    }
  };
  if (manualDoc?.value) {
    registerDocId(manualDoc.value, manualTrainingSource);
  }
  if (textDocIds.length > 0) {
    registerDocIds(textDocIds, textBlogSource);
  }
  if (videoDocIds.length > 0) {
    registerDocIds(videoDocIds, videoTranscriptsSource);
  }

  const expectedDocIdBySourceKey = new Map<string, Set<string>>();
  if (manualDoc?.value) {
    expectedDocIdBySourceKey.set(
      manualTrainingSource.toLowerCase(),
      new Set([manualDoc.value, normalizeDidDocumentId(manualDoc.value)]),
    );
  }
  if (textDocIds.length > 0) {
    expectedDocIdBySourceKey.set(
      textBlogSource.toLowerCase(),
      new Set(textDocIds.flatMap((id) => [id, normalizeDidDocumentId(id)])),
    );
  }
  if (videoDocIds.length > 0) {
    expectedDocIdBySourceKey.set(
      videoTranscriptsSource.toLowerCase(),
      new Set(videoDocIds.flatMap((id) => [id, normalizeDidDocumentId(id)])),
    );
  }

  const cleanupKnownSources = async () => {
    const manualDocIds = manualDoc?.value
      ? [manualDoc.value, normalizeDidDocumentId(manualDoc.value)]
      : [];
    const textDocIds = textSource?.documentId
      ? parseStoredDocumentIds(textSource.documentId).flatMap((id) => [
          id,
          normalizeDidDocumentId(id),
        ])
      : [];
    const videoDocIds = videoSource?.documentId
      ? parseStoredDocumentIds(videoSource.documentId).flatMap((id) => [
          id,
          normalizeDidDocumentId(id),
        ])
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
        const expectedDocIds = expectedDocIdBySourceKey.get(titleKey);

        if (expectedDocIds && !expectedDocIds.has(docId)) {
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
      .filter((item): item is KnowledgeItem => item !== null);

    const extraLocal = await prisma.knowledgeDocuments.findMany({
      where: { documentId: { notIn: queryDocumentIds } },
      orderBy: { createdAt: "desc" },
    });

    const extraMapped = extraLocal
      .map((doc) => {
        const sourceKey = doc.source.trim().toLowerCase();
        const expectedDocIds = expectedDocIdBySourceKey.get(sourceKey);
        if (
          expectedDocIds &&
          doc.documentId &&
          !expectedDocIds.has(doc.documentId) &&
          !expectedDocIds.has(normalizeDidDocumentId(doc.documentId))
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
    const seenIds = new Set<string>();
    const unique = combined.filter((item) => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    });
    const dedupeKeys = new Set(["manual training"]);
    const seen = new Set<string>();
    return unique.filter((item) => {
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
  const azureRegion = process.env.AZURE_SPEECH_REGION ?? "";
  return {
    apiKey: apiKey ? maskCentered(apiKey, 8) : "",
    azureRegion,
  };
}

export async function fetchAuthRequirement(): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: authRequiredKey },
  });
  return setting?.value === "true";
}

export async function fetchSessionRoles(): Promise<SessionRoleOption[]> {
  const agents = await prisma.agent.findMany({
    select: { id: true, displayName: true },
    orderBy: { createdAt: "asc" },
  });
  return agents.map((agent) => ({ id: agent.id, name: agent.displayName }));
}

export async function fetchSessionRecords(
  filters: SessionFilters,
): Promise<SessionPage> {
  // @ts-expect-error Prisma type inference doesn't like dynamic filters here.
  const where: Parameters<typeof prisma.chatSession.count>[0]["where"] = {};
  if (filters.roleId) {
    where.agentId = filters.roleId;
  }
  const range = parseDateRange(filters.from, filters.to);
  if (range.gte || range.lte) {
    where.createdAt = range;
  }
  if (filters.language) {
    where.language = filters.language;
  }

  const total = await prisma.chatSession.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const page = Math.min(Math.max(filters.page, 1), totalPages);
  const sessions = await prisma.chatSession.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * filters.limit,
    take: filters.limit,
    include: {
      agent: { select: { displayName: true } },
      messages: { orderBy: { createdAt: "asc" } },
      _count: { select: { messages: true } },
    },
  });

  const rows: SessionRow[] = sessions.map((session) => {
    const languageCount = new Map<string, number>();
    for (const message of session.messages) {
      if (message.role !== "USER") continue;
      if (!message.language) continue;
      const current = languageCount.get(message.language) ?? 0;
      languageCount.set(message.language, current + 1);
    }
    const dominantLanguage = Array.from(languageCount.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];

    return {
      id: session.id,
      sessionId: resolveSessionIdentifier(session),
      roleName: session.agent?.displayName ?? session.didAgentId,
      language: dominantLanguage ?? session.language ?? "Unknown",
      device: session.device ?? resolveDeviceLabel(session.userAgent),
      messageCount: session._count.messages,
      startedAt: toLocalDateTime(session.createdAt),
      messages: session.messages.map((message) => ({
        id: message.id,
        role: message.role.toLowerCase() as SessionMessageItem["role"],
        content: message.content,
        createdAt: toLocalDateTime(message.createdAt),
      })),
    };
  });

  return {
    rows,
    total,
    page,
    limit: filters.limit,
    totalPages,
  };
}

export async function fetchErrorLogs(
  filters: ErrorLogFilters,
): Promise<ErrorLogPage> {
  const total = await prisma.externalServiceLog.count();
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const page = Math.min(Math.max(filters.page, 1), totalPages);

  const logs = await prisma.externalServiceLog.findMany({
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * filters.limit,
    take: filters.limit,
  });

  const rows: ErrorLogRow[] = logs.map((log) => ({
    id: log.id,
    createdAt: toLocalDateTime(log.createdAt),
    source: log.source,
    type: log.type,
    message: log.message,
    level:
      log.level === "WARNING"
        ? "warning"
        : log.level === "INFO"
          ? "info"
          : "error",
    metadata: log.metadata ?? undefined,
  }));

  return {
    rows,
    total,
    page,
    limit: filters.limit,
    totalPages,
  };
}
