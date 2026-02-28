"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auditAuth } from "@/lib/audit/auth";
import {
  clearPending2faCookie,
  getPending2faCookie,
  setSessionCookie,
} from "@/lib/auth/cookies";
import { createSession } from "@/lib/auth/session";
import { verifyEmail2fa } from "@/lib/auth/twofactor";
import { prisma } from "@/lib/db/prisma";
import { sendNeilUserLoginEmail } from "@/lib/email/smtp";
import { logExternalServiceError } from "@/lib/logging/external-errors";

const Schema = z.object({
  code: z.string().regex(/^\d{6}$/),
  scope: z.enum(["user", "admin"]).optional(),
});

const isRegularUserRoles = (roles: string[]) =>
  roles.includes("USER") && !roles.includes("ADMIN");

export async function twoFactorVerify(input: unknown) {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, reason: "invalid_code" as const };
  }
  const { code, scope } = parsed.data;

  try {
    const pending = await getPending2faCookie();
    if (!pending) {
      await auditAuth({
        type: "LOGIN_OTP_VERIFY",
        success: false,
        reason: "missing_pending",
      });
      return { ok: false as const, reason: "missing_pending" as const };
    }

    const [userId, tokenId] = pending.split(":");
    if (!userId || !tokenId) {
      await auditAuth({
        type: "LOGIN_OTP_VERIFY",
        success: false,
        reason: "invalid_pending",
        userId,
      });
      return { ok: false as const, reason: "invalid_pending" as const };
    }

    const v = await verifyEmail2fa({ userId, tokenId, code });

    const rawHeaders = await headers();
    const ip = rawHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ua = rawHeaders.get("user-agent") ?? undefined;

    await auditAuth({
      type: "LOGIN_OTP_VERIFY",
      success: v.ok,
      reason: v.ok ? undefined : v.reason,
      userId,
      ip,
      userAgent: ua,
    });

    if (!v.ok) return v;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        roles: { select: { role: true } },
      },
    });
    const userRoles = user?.roles.map((item) => item.role) ?? [];
    const isRegularUser = isRegularUserRoles(userRoles);

    const session = await createSession({ userId, ip, userAgent: ua });
    await setSessionCookie(session.rawToken, session.expiresAt, {
      sessionOnly: scope === "user" && isRegularUser,
    });
    await clearPending2faCookie();

    if (scope === "user" && isRegularUser && user?.email) {
      await sendNeilUserLoginEmail(user.email).catch(async (error) => {
        await logExternalServiceError({
          source: "SMTP",
          type: "USER_LOGIN_NOTIFY",
          message:
            error instanceof Error
              ? error.message
              : "Failed to send login notification",
          level: "WARNING",
        });
      });
    }

    return { ok: true as const };
  } catch (error) {
    await logExternalServiceError({
      source: "AUTH",
      type: "OTP_VERIFY",
      message:
        error instanceof Error ? error.message : "Unexpected OTP verify error",
    });
    return { ok: false as const, reason: "server_error" as const };
  }
}
