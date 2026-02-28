"use server";

import { auditAuth } from "@/lib/audit/auth";
import { clearSessionCookie, getSessionCookie } from "@/lib/auth/cookies";
import { getSession, revokeSession } from "@/lib/auth/session";
import { sendNeilUserLogoutEmail } from "@/lib/email/smtp";
import { logExternalServiceError } from "@/lib/logging/external-errors";

const isRegularUserRoles = (roles: string[]) =>
  roles.includes("USER") && !roles.includes("ADMIN");

export async function logout() {
  const raw = await getSessionCookie();
  const currentSession = raw ? await getSession(raw).catch(() => null) : null;

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

    if (isRegularUserRoles(currentSession.user.roles)) {
      await sendNeilUserLogoutEmail(currentSession.user.email).catch(
        async (error) => {
          await logExternalServiceError({
            source: "SMTP",
            type: "USER_LOGOUT_NOTIFY",
            message:
              error instanceof Error
                ? error.message
                : "Failed to send logout notification",
            level: "WARNING",
          });
        },
      );
    }
  }

  await clearSessionCookie();
  return { ok: true as const };
}
