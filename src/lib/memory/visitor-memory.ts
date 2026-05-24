import { prisma } from "@/lib/db/prisma";
import {
  type SessionTurn,
  summarizeSession,
} from "@/lib/memory/summarize-session";
import { normalizeDidChatText } from "@/lib/text/did-chat";

export interface MemoryIdentity {
  userId?: string | null;
  visitorId?: string | null;
}

const hasIdentity = (id: MemoryIdentity): boolean =>
  Boolean(id.userId || id.visitorId);

// Read the memory row for injection. Prefers the logged-in user's row,
// falling back to the anonymous visitor row if the user has no row yet.
export const getMemoryForInjection = async (
  id: MemoryIdentity,
): Promise<{ summary: string; displayName: string | null } | null> => {
  if (!hasIdentity(id)) return null;
  try {
    if (id.userId) {
      const byUser = await prisma.visitorMemory.findUnique({
        where: { userId: id.userId },
        select: { summary: true, displayName: true },
      });
      if (byUser) return byUser;
    }
    if (id.visitorId) {
      const byVisitor = await prisma.visitorMemory.findUnique({
        where: { visitorId: id.visitorId },
        select: { summary: true, displayName: true },
      });
      if (byVisitor) return byVisitor;
    }
    return null;
  } catch (error) {
    console.error("getMemoryForInjection failed:", error);
    return null;
  }
};

export const buildMemorySystemMessage = (memory: {
  summary: string;
  displayName: string | null;
}): string | null => {
  const summary = memory.summary?.trim();
  if (!summary) return null;
  const namePart = memory.displayName
    ? `The visitor's name is ${memory.displayName}. `
    : "";
  return `Context you remember about this visitor from previous conversations (use it naturally to personalize your replies, do not recite it back verbatim): ${namePart}${summary}`;
};

// Locate (or create) the single memory row for a given identity, performing
// "adoption": if the user just logged in and only an anonymous row exists,
// attach it to the user instead of creating a duplicate.
const getOrCreateMemoryRow = async (id: MemoryIdentity) => {
  if (id.userId) {
    const byUser = await prisma.visitorMemory.findUnique({
      where: { userId: id.userId },
    });
    if (byUser) return byUser;

    if (id.visitorId) {
      const byVisitor = await prisma.visitorMemory.findUnique({
        where: { visitorId: id.visitorId },
      });
      if (byVisitor && !byVisitor.userId) {
        return prisma.visitorMemory.update({
          where: { id: byVisitor.id },
          data: { userId: id.userId },
        });
      }
    }
    try {
      return await prisma.visitorMemory.create({
        data: { userId: id.userId, visitorId: id.visitorId ?? null },
      });
    } catch {
      // Lost a create race — re-read the winning row.
      const byUserRetry = await prisma.visitorMemory.findUnique({
        where: { userId: id.userId },
      });
      if (byUserRetry) return byUserRetry;
      if (id.visitorId) {
        const byVisitorRetry = await prisma.visitorMemory.findUnique({
          where: { visitorId: id.visitorId },
        });
        if (byVisitorRetry) return byVisitorRetry;
      }
      throw new Error("Failed to resolve memory row after create conflict");
    }
  }

  // Anonymous only.
  const byVisitor = await prisma.visitorMemory.findUnique({
    where: { visitorId: id.visitorId as string },
  });
  if (byVisitor) return byVisitor;
  try {
    return await prisma.visitorMemory.create({
      data: { visitorId: id.visitorId as string },
    });
  } catch {
    const retry = await prisma.visitorMemory.findUnique({
      where: { visitorId: id.visitorId as string },
    });
    if (retry) return retry;
    throw new Error("Failed to resolve memory row after create conflict");
  }
};

const loadSessionTurns = async (
  sessionRowId: string,
): Promise<SessionTurn[]> => {
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId: sessionRowId, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  return rows.map((r) => ({
    role: r.role === "USER" ? "user" : "assistant",
    content:
      r.role === "ASSISTANT" ? normalizeDidChatText(r.content) : r.content,
  }));
};

// Summarize ONE chat session and merge it into the identity's rolling
// memory. Concurrency-safe: atomically "claims" the session by setting
// summarizedAt only if it is still null — only the winner proceeds, so a
// closeSession + a parallel backfill can never double-count. On failure the
// claim is released so the session can be retried later.
export const summarizeAndPersistSession = async (
  chatSessionId: string,
): Promise<void> => {
  // Atomic claim: returns count=1 only for the caller that flips it.
  const claimedAt = new Date();
  const claim = await prisma.chatSession
    .updateMany({
      where: { id: chatSessionId, summarizedAt: null },
      data: { summarizedAt: claimedAt },
    })
    .catch(() => ({ count: 0 }));
  if (!claim || claim.count === 0) return;

  const releaseClaim = async () => {
    await prisma.chatSession
      .updateMany({
        where: { id: chatSessionId, summarizedAt: claimedAt },
        data: { summarizedAt: null },
      })
      .catch(() => undefined);
  };

  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
      select: { id: true, userId: true, visitorId: true },
    });
    if (!session || (!session.userId && !session.visitorId)) {
      // Nothing to attach memory to — leave it claimed (won't retry).
      return;
    }

    const turns = await loadSessionTurns(session.id);
    if (turns.length === 0) return; // claimed; empty session, nothing to do

    const row = await getOrCreateMemoryRow({
      userId: session.userId,
      visitorId: session.visitorId,
    });

    const update = await summarizeSession(row.summary, turns);
    if (!update) {
      // LLM failed — release the claim so a later run can retry.
      await releaseClaim();
      return;
    }

    await prisma.visitorMemory.update({
      where: { id: row.id },
      data: {
        summary: update.summary,
        displayName: update.displayName ?? row.displayName,
        sessionCount: { increment: 1 },
        lastSessionAt: new Date(),
      },
    });
  } catch (error) {
    await releaseClaim();
    console.error("summarizeAndPersistSession failed:", error);
  }
};

// Safety net for sessions that ended abruptly (tab closed → no closeSession).
// Folds any prior un-summarized sessions for this identity into memory.
export const backfillUnsummarizedSessions = async (
  id: MemoryIdentity,
  options?: { excludeChatId?: string; limit?: number },
): Promise<void> => {
  if (!hasIdentity(id)) return;
  try {
    const orFilters: Array<Record<string, unknown>> = [];
    if (id.userId) orFilters.push({ userId: id.userId });
    if (id.visitorId) orFilters.push({ visitorId: id.visitorId });
    if (orFilters.length === 0) return;

    const sessions = await prisma.chatSession.findMany({
      where: {
        OR: orFilters,
        summarizedAt: null,
        ...(options?.excludeChatId
          ? { didChatId: { not: options.excludeChatId } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      take: options?.limit ?? 5,
      select: { id: true },
    });

    for (const s of sessions) {
      await summarizeAndPersistSession(s.id);
    }
  } catch (error) {
    console.error("backfillUnsummarizedSessions failed:", error);
  }
};

// On login, attach an existing anonymous memory to the user (merge identity).
export const adoptVisitorMemory = async (
  userId: string,
  visitorId: string | null,
): Promise<void> => {
  if (!visitorId) return;
  try {
    const userMemory = await prisma.visitorMemory.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (userMemory) return; // user already has memory; keep it
    const visitorMemory = await prisma.visitorMemory.findUnique({
      where: { visitorId },
      select: { id: true, userId: true },
    });
    if (visitorMemory && !visitorMemory.userId) {
      await prisma.visitorMemory.update({
        where: { id: visitorMemory.id },
        data: { userId },
      });
    }
  } catch (error) {
    console.error("adoptVisitorMemory failed:", error);
  }
};
