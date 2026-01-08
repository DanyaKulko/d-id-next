"use server";

import type { z } from "zod";
import { ensureClientAuth } from "@/lib/auth/client-access";
import { didService } from "@/lib/services/did.service";
import {
  chatSchema,
  closeSessionSchema,
  submitAnswerSchema,
  submitIceSchema,
} from "@/lib/validators/agent.schema";

function handleError(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as { response?: { data?: unknown }; message?: string })
      : {};
  const msg = record.response?.data
    ? JSON.stringify(record.response.data)
    : (record.message ?? "Unknown error");
  console.error("Action Error:", msg);
  return { success: false, error: msg };
}

export async function getAgentAction(agentId: string) {
  try {
    await ensureClientAuth();
    const data = await didService.getAgent(agentId);
    return { success: true, data };
  } catch (error) {
    return handleError(error);
  }
}

export async function createSessionAction(agentId: string) {
  try {
    await ensureClientAuth();
    const data = await didService.createSession(agentId);
    return { success: true, data };
  } catch (error) {
    return handleError(error);
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
    return handleError(error);
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
    const { chatId, streamId, sessionId, text } = result.data;
    const data = await didService.chat(
      agentId,
      chatId,
      streamId,
      sessionId,
      text,
    );
    return { success: true, data };
  } catch (error) {
    return handleError(error);
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
    return { success: true, status: "closed" };
  } catch (error) {
    return handleError(error);
  }
}
