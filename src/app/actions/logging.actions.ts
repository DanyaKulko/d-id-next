"use server";

import { ensureClientAuth } from "@/lib/auth/client-access";
import { logExternalServiceError } from "@/lib/logging/external-errors";
import { externalLogSchema } from "@/lib/validators/log.schema";

export async function logExternalErrorAction(payload: unknown) {
  const parsed = externalLogSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Invalid log payload" };
  }

  try {
    await ensureClientAuth();
    await logExternalServiceError(parsed.data);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to log error",
    };
  }
}
