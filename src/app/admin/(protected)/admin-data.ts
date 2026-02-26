"use server";

import { findAgentByKey } from "@/lib/agents/agents.db";
import { prisma } from "@/lib/db/prisma";
import { didService } from "@/lib/services/did.service";
import { normalizeDidChatText } from "@/lib/text/did-chat";
import { defaultSafetyRules } from "./actions/shared";

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
  isEnabled: boolean;
};

export type TrainingRoleOption = {
  key: string;
  name: string;
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

const authRequiredKey = "requireAuthentication";

const normalizeDidDocumentId = (value: string) =>
  value.includes("#") ? (value.split("#").pop() ?? value) : value;

const resolveTrainingAgent = async (agentKey: string) => {
  const key = agentKey.trim();
  if (!key) {
    throw new Error("Agent key is required");
  }
  const agent = await findAgentByKey(key);
  if (!agent) {
    throw new Error("Agent not found");
  }
  return agent;
};

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

export async function fetchTrainingRoles(): Promise<TrainingRoleOption[]> {
  const roles = await prisma.agent.findMany({
    select: {
      id: true,
      slug: true,
      agentId: true,
      displayName: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return roles.map((role) => ({
    key: role.slug ?? role.agentId ?? role.id,
    name: role.displayName,
  }));
}

export async function fetchKnowledgeArchive(
  agentKey: string,
): Promise<KnowledgeItem[]> {
  const agent = await resolveTrainingAgent(agentKey);
  const knowledgeBaseId = agent.knowledgeBaseId?.trim() ?? "";
  const localDocs = await prisma.knowledgeDocuments.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
  });

  const mapLocalDoc = (doc: (typeof localDocs)[number]): KnowledgeItem => ({
    id: doc.id,
    title: doc.title ?? doc.source,
    sourceLabel: doc.source,
    created: doc.createdAt.toISOString().split("T")[0],
    status:
      doc.status === "READY"
        ? "active"
        : doc.status === "FAILED"
          ? "error"
          : "processing",
    url: doc.documentUrl ?? undefined,
    isEnabled: doc.isEnabled,
  });

  if (!knowledgeBaseId) {
    return localDocs.map(mapLocalDoc);
  }

  try {
    const documents = await didService.listKnowledgeDocuments(knowledgeBaseId);
    const remoteDocs = Array.isArray(documents) ? documents : [];
    const localByDocumentId = new Map<string, (typeof localDocs)[number]>();

    for (const local of localDocs) {
      if (!local.documentId) continue;
      const normalized = normalizeDidDocumentId(local.documentId);
      localByDocumentId.set(local.documentId, local);
      localByDocumentId.set(normalized, local);
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

    const mappedRemote: KnowledgeItem[] = remoteDocs
      .map((doc) => {
        const remoteId = String(doc.id ?? doc.document_id ?? doc.documentId ?? "");
        if (!remoteId) return null;
        const local =
          localByDocumentId.get(remoteId) ??
          localByDocumentId.get(normalizeDidDocumentId(remoteId));
        if (!local) return null;
        if (local && !local.isEnabled) return null;

        const remoteStatus = String(doc.status ?? "").toLowerCase();
        const remoteUrlRaw = doc.documentUrl ?? doc.url ?? doc.document_url;
        const remoteUrl =
          typeof remoteUrlRaw === "string" && !remoteUrlRaw.startsWith("s3://")
            ? remoteUrlRaw
            : undefined;
        const titleRaw = String(doc.title ?? doc.name ?? "").trim();

        return {
          id: local?.id ?? remoteId,
          title:
            local?.title ?? (titleRaw || local?.source || "Knowledge Document"),
          sourceLabel: local?.source ?? "Knowledge",
          created: doc.created_at
            ? new Date(doc.created_at).toISOString().split("T")[0]
            : local?.createdAt.toISOString().split("T")[0] ?? "",
          status: statusMap[remoteStatus] ?? "processing",
          url: local?.documentUrl ?? remoteUrl,
          isEnabled: local?.isEnabled ?? true,
        } satisfies KnowledgeItem;
      })
      .filter((item): item is KnowledgeItem => Boolean(item));

    const remoteIds = new Set(
      remoteDocs
        .map((doc) => String(doc.id ?? doc.document_id ?? doc.documentId ?? ""))
        .filter((value) => Boolean(value))
        .flatMap((id) => [id, normalizeDidDocumentId(id)]),
    );

    const onlyLocal = localDocs
      .filter((doc) => {
        if (!doc.isEnabled) return true;
        if (!doc.documentId) return true;
        return !remoteIds.has(doc.documentId);
      })
      .map(mapLocalDoc);

    const merged = [...mappedRemote, ...onlyLocal];
    const seen = new Set<string>();
    return merged.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  } catch {
    return localDocs.map(mapLocalDoc);
  }
}

export async function fetchSafetyInstructions(agentKey: string): Promise<string> {
  const agent = await resolveTrainingAgent(agentKey);
  return agent.safetyRules?.trim() ? agent.safetyRules : defaultSafetyRules;
}

export async function fetchManualTrainingTemplate(
  agentKey: string,
): Promise<string> {
  const agent = await resolveTrainingAgent(agentKey);
  const manual = await prisma.agentTrainingManual.findUnique({
    where: { agentId: agent.id },
    select: { manualText: true },
  });
  return manual?.manualText?.trim() ? manual.manualText : "";
}

export async function fetchTextBlogEnabled(agentKey: string): Promise<boolean> {
  const agent = await resolveTrainingAgent(agentKey);
  return agent.blogKnowledgeEnabled;
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
        content:
          message.role === "ASSISTANT"
            ? normalizeDidChatText(message.content)
            : message.content,
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
