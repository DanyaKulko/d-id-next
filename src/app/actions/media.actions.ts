"use server";

import type { z } from "zod";
import { ensureClientAuth } from "@/lib/auth/client-access";
import {
  isAxiosError,
  logExternalServiceError,
  resolveExternalErrorDetails,
} from "@/lib/logging/external-errors";
import { resolveMediaIntent } from "@/lib/media/orchestrator";
import type { MediaResolveResult } from "@/lib/media/types";
import { resolveMediaIntentSchema } from "@/lib/validators/agent.schema";

type Payload = z.infer<typeof resolveMediaIntentSchema>;

const NONE_RESULT: MediaResolveResult = { intent: "none", items: [] };

function handleError(error: unknown, context = "Media Intent") {
  const details = resolveExternalErrorDetails(error);
  if (isAxiosError(error)) {
    void logExternalServiceError({
      source: "Media",
      type: context,
      message: details.message,
      metadata: details.metadata,
    });
  }
  console.error("Media Action Error:", details.message);
}

export async function resolveMediaIntentAction(
  agentId: string,
  payload: Payload,
): Promise<{ success: true; data: MediaResolveResult }> {
  const parsed = resolveMediaIntentSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: true, data: NONE_RESULT };
  }

  try {
    await ensureClientAuth();
    const data = await resolveMediaIntent({
      agentId,
      chatId: parsed.data.chatId,
      streamId: parsed.data.streamId,
      sessionId: parsed.data.sessionId,
      text: parsed.data.text,
      language: parsed.data.language,
    });
    return { success: true, data };
  } catch (error) {
    handleError(error, "Resolve Intent");
    return { success: true, data: NONE_RESULT };
  }
}
