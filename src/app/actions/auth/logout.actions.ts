"use server";

import { auditAuth } from "@/lib/audit/auth";
import { clearSessionCookie, getSessionCookie } from "@/lib/auth/cookies";
import { revokeSession } from "@/lib/auth/session";
import { endCurrentUserWebSession } from "@/lib/auth/user-web-session";
import { getCurrentUser } from "@/lib/auth/require";

export async function logout() {
  const currentSession = await getCurrentUser().catch(() => null);
  const raw = await getSessionCookie();

  await endCurrentUserWebSession("AUTH_LOGOUT").catch(() => undefined);

  if (raw) {
    await revokeSession(raw).catch(() => undefined);
  }

  if (currentSession?.user) {
    await auditAuth({
      type: "LOGOUT",
      success: true,
      email: currentSession.user.email,
      userId: currentSession.user.id,
    }).catch(() => undefined);
  }

  await clearSessionCookie();
  return { ok: true as const };
}
