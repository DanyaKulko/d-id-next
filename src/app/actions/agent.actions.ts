"use server";

import { headers } from "next/headers";
import type { z } from "zod";
import { ensureClientAuth } from "@/lib/auth/client-access";
import { getCurrentUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import {
  isAxiosError,
  logExternalServiceError,
  resolveExternalErrorDetails,
} from "@/lib/logging/external-errors";
import { didService } from "@/lib/services/did.service";
import {
  assistantMessageSchema,
  chatSchema,
  closeSessionSchema,
  submitAnswerSchema,
  submitIceSchema,
} from "@/lib/validators/agent.schema";

const resolveDeviceLabel = (userAgent?: string | null) => {
  if (!userAgent) return "Unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("mobile")) return "Mobile";
  if (ua.includes("tablet") || ua.includes("ipad")) return "Tablet";
  return "Desktop";
};

const resolveAssistantMessage = (data: unknown) => {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const messages = record.messages;
  if (Array.isArray(messages)) {
    const lastAssistant = [...messages]
      .reverse()
      .find(
        (item) =>
          item &&
          typeof item === "object" &&
          (item as Record<string, unknown>).role === "assistant",
      ) as Record<string, unknown> | undefined;
    if (lastAssistant?.content && typeof lastAssistant.content === "string") {
      return lastAssistant.content;
    }
  }

  if (typeof record.result === "string" && record.result.trim()) {
    return record.result;
  }

  const candidates = [
    record.reply,
    record.response,
    record.answer,
    record.message,
    record.text,
    record.output,
    record.data,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
};

const updateSessionLanguage = async (
  sessionId: string,
  fallbackLanguage?: string,
) => {
  const topLanguage = await prisma.chatMessage
    .groupBy({
      by: ["language"],
      where: {
        sessionId,
        role: "USER",
        language: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { language: "desc" } },
      take: 1,
    })
    .then((rows) => rows[0]?.language ?? null)
    .catch(() => null);

  const resolved = topLanguage ?? fallbackLanguage ?? null;
  if (!resolved) return;

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { language: resolved },
  });
};

function handleError(error: unknown, context = "D-ID") {
  const details = resolveExternalErrorDetails(error);
  if (isAxiosError(error)) {
    void logExternalServiceError({
      source: "D-ID",
      type: context,
      message: details.message,
      metadata: details.metadata,
    });
  }
  console.error("Action Error:", details.message);
  return { success: false, error: details.message };
}

export async function getAgentAction(agentId: string) {
  try {
    await ensureClientAuth();
    const data = await didService.getAgent(agentId);
    return { success: true, data };
  } catch (error) {
    return handleError(error, "Get Agent");
  }
}

export async function createSessionAction(
  agentId: string,
  metadata?: { language?: string },
) {
  try {
    await ensureClientAuth();
    const data = await didService.createSession(agentId);
    const session = await getCurrentUser();
    const rawHeaders = await headers();
    const userAgent = rawHeaders.get("user-agent");
    const ip = rawHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();

    const streamId = String((data as Record<string, unknown>).streamId ?? "");
    const sessionId = String((data as Record<string, unknown>).sessionId ?? "");
    const chatId = String((data as Record<string, unknown>).chatId ?? "");

    const agent = await prisma.agent.findFirst({
      where: { agentId },
      select: { id: true },
    });

    if (streamId && chatId) {
      await prisma.chatSession
        .create({
          data: {
            didAgentId: agentId,
            didStreamId: streamId,
            didSessionId: sessionId || null,
            didChatId: chatId,
            agentId: agent?.id ?? null,
            userId: session?.user.id ?? null,
            userAgent: userAgent ?? null,
            ip: ip ?? null,
            device: resolveDeviceLabel(userAgent),
            language: metadata?.language ?? null,
          },
        })
        .catch(() => undefined);
    }
    return { success: true, data };
  } catch (error) {
    return handleError(error, "Create Session");
  }
}

export async function submitAnswerAction(
  agentId: string,
  payload: z.infer<typeof submitAnswerSchema>,
) {
  const result = submitAnswerSchema.safeParse(payload);
  if (!result.success) return { success: false, error: "Validation failed" };

  try {
    await ensureClientAuth();
    const { streamId, sessionId, answer } = result.data;
    const data = await didService.submitAnswer(
      agentId,
      streamId,
      sessionId,
      answer,
    );
    return { success: true, data };
  } catch (error) {
    return handleError(error, "Submit Answer");
  }
}

export async function submitIceAction(
  agentId: string,
  payload: z.infer<typeof submitIceSchema>,
) {
  // Валидация
  const result = submitIceSchema.safeParse(payload);
  if (!result.success) return { success: false, error: "Validation failed" };

  try {
    await ensureClientAuth();
    const { streamId, sessionId, candidate } = result.data;
    const data = await didService.submitIce(
      agentId,
      streamId,
      sessionId,
      candidate,
    );
    return { success: true, data };
  } catch (error) {
    // ICE кандидаты часто фейлятся, это нормально для WebRTC, можно просто логировать
    console.warn("ICE Warning:", error);
    return { success: false, error: "ICE failed but continued" };
  }
}

export async function chatAction(
  agentId: string,
  payload: z.infer<typeof chatSchema>,
) {
  const result = chatSchema.safeParse(payload);
  if (!result.success) return { success: false, error: "Validation failed" };

  try {
    await ensureClientAuth();
    const { chatId, streamId, sessionId, text, language } = result.data;

    const session = await prisma.chatSession.findUnique({
      where: { didChatId: chatId },
    });
    if (!session) {
      const [sessionUser, agentRecord] = await Promise.all([
        getCurrentUser(),
        prisma.agent.findFirst({
          where: { agentId },
          select: { id: true },
        }),
      ]);
      const rawHeaders = await headers();
      const userAgent = rawHeaders.get("user-agent");
      const ip = rawHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();

      const sessionRecord = await prisma.chatSession
        .create({
          data: {
            didAgentId: agentId,
            didStreamId: streamId,
            didSessionId: sessionId,
            didChatId: chatId,
            agentId: agentRecord?.id ?? null,
            userId: sessionUser?.user.id ?? null,
            userAgent: userAgent ?? null,
            ip: ip ?? null,
            device: resolveDeviceLabel(userAgent),
            language: language?.trim() || null,
          },
        })
        .catch(() => null);
      if (sessionRecord) {
        await prisma.chatMessage.create({
          data: {
            sessionId: sessionRecord.id,
            role: "USER",
            content: text,
            language: language?.trim() || null,
          },
        });
        await updateSessionLanguage(sessionRecord.id, language?.trim());
      }
    } else {
      await prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: "USER",
          content: text,
          language: language?.trim() || null,
        },
      });
      await updateSessionLanguage(session.id, language?.trim());
    }

    const activeSession = session
      ? session
      : await prisma.chatSession.findUnique({
          where: { didChatId: chatId },
        });

    const history = activeSession
      ? await prisma.chatMessage.findMany({
          where: { sessionId: activeSession.id },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const messagesPayload =
      history.length > 0
        ? history.map((message) => ({
            role: message.role.toLowerCase() as "system" | "user" | "assistant",
            content: message.content,
            created_at: message.createdAt.toISOString(),
          }))
        : [
            {
              role: "user" as const,
              content: text,
              created_at: new Date().toISOString(),
            },
          ];

    const data = await didService.chat(
      agentId,
      chatId,
      streamId,
      sessionId,
      messagesPayload,
    );

    if (activeSession) {
      const assistantMessage = resolveAssistantMessage(data);
      if (assistantMessage) {
        await prisma.chatMessage.create({
          data: {
            sessionId: activeSession.id,
            role: "ASSISTANT",
            content: assistantMessage,
          },
        });
      }
    }
    return { success: true, data };
  } catch (error) {
    return handleError(error, "Chat Message");
  }
}

export async function appendAssistantMessageAction(
  agentId: string,
  payload: z.infer<typeof assistantMessageSchema>,
) {
  const result = assistantMessageSchema.safeParse(payload);
  if (!result.success) return { success: false, error: "Validation failed" };

  try {
    await ensureClientAuth();
    const { chatId, streamId, sessionId, message } = result.data;
    if (!message.trim()) return { success: true, skipped: true };

    let session = await prisma.chatSession.findUnique({
      where: { didChatId: chatId },
    });

    if (!session) {
      const [sessionUser, agentRecord] = await Promise.all([
        getCurrentUser(),
        prisma.agent.findFirst({
          where: { agentId },
          select: { id: true },
        }),
      ]);
      const rawHeaders = await headers();
      const userAgent = rawHeaders.get("user-agent");
      const ip = rawHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();

      session = await prisma.chatSession
        .create({
          data: {
            didAgentId: agentId,
            didStreamId: streamId,
            didSessionId: sessionId,
            didChatId: chatId,
            agentId: agentRecord?.id ?? null,
            userId: sessionUser?.user.id ?? null,
            userAgent: userAgent ?? null,
            ip: ip ?? null,
            device: resolveDeviceLabel(userAgent),
          },
        })
        .catch(() => null);
    }

    if (!session) {
      return { success: true, skipped: true };
    }

    const lastAssistant = await prisma.chatMessage.findFirst({
      where: { sessionId: session.id, role: "ASSISTANT" },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
    if (lastAssistant?.content === message.trim()) {
      return { success: true, skipped: true };
    }

    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "ASSISTANT",
        content: message.trim(),
      },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "Append Assistant Message");
  }
}

export async function closeSessionAction(
  agentId: string,
  payload: z.infer<typeof closeSessionSchema>,
) {
  const result = closeSessionSchema.safeParse(payload);
  if (!result.success) return { success: false, error: "Validation failed" };

  try {
    await ensureClientAuth();
    await didService.closeSession(agentId, result.data.streamId);
    await prisma.chatSession.updateMany({
      where: { didStreamId: result.data.streamId },
      data: { endedAt: new Date() },
    });
    return { success: true, status: "closed" };
  } catch (error) {
    return handleError(error, "Close Session");
  }
}
