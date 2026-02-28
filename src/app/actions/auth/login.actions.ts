"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auditAuth } from "@/lib/audit/auth";
import {
  clearPending2faCookie,
  setPending2faCookie,
  setSessionCookie,
} from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/passwords";
import { createSession } from "@/lib/auth/session";
import { startEmail2fa } from "@/lib/auth/twofactor";
import { prisma } from "@/lib/db/prisma";
import { sendNeilUserLoginEmail } from "@/lib/email/smtp";
import { logExternalServiceError } from "@/lib/logging/external-errors";
import { verifyRecaptcha } from "@/lib/security/recaptcha";

const userTwoFactorRequiredKey = "requireUserTwoFactorAuthentication";

const Schema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(6).max(200),
  // password: z.string().min(8).max(200),
  recaptchaToken: z.string().optional(),
  scope: z.enum(["user", "admin"]).optional(),
});

const isRegularUserRoles = (roles: string[]) =>
  roles.includes("USER") && !roles.includes("ADMIN");

export async function loginStart(input: unknown) {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, step: "login" as const };
  }
  const { email, password, recaptchaToken, scope } = parsed.data;

  try {
    const rawHeaders = await headers();
    const ip = rawHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ua = rawHeaders.get("user-agent") ?? undefined;

    if (process.env.NODE_ENV === "production") {
      const r = await verifyRecaptcha(recaptchaToken ?? "", ip);
      if (!r.ok) {
        await auditAuth({
          type: "LOGIN_PASSWORD",
          success: false,
          reason: "captcha_failed",
          email,
          ip,
          userAgent: ua,
        });
        return { ok: false as const, step: "login" as const };
      }
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isActive: true,
        roles: { select: { role: true } },
      },
    });
    if (!user) {
      await auditAuth({
        type: "LOGIN_PASSWORD",
        success: false,
        reason: "user_not_found",
        email,
        ip,
        userAgent: ua,
      });
      return { ok: false as const, step: "login" as const };
    }
    if (!user.isActive) {
      await auditAuth({
        type: "LOGIN_PASSWORD",
        success: false,
        reason: "user_inactive",
        email: user.email,
        userId: user.id,
        ip,
        userAgent: ua,
      });
      return { ok: false as const, step: "login" as const };
    }

    const okPwd = await verifyPassword(user.passwordHash, password);
    await auditAuth({
      type: "LOGIN_PASSWORD",
      success: okPwd,
      reason: okPwd ? undefined : "wrong_password",
      email: user.email,
      userId: user.id,
      ip,
      userAgent: ua,
    });
    if (!okPwd) return { ok: false as const, step: "login" as const };

    const userRoles = user.roles.map((item) => item.role);
    const isRegularUser = isRegularUserRoles(userRoles);

    const userTwoFactorSetting = await prisma.appSetting.findUnique({
      where: { key: userTwoFactorRequiredKey },
      select: { value: true },
    });
    const isUserTwoFactorRequired = userTwoFactorSetting
      ? userTwoFactorSetting.value === "true"
      : true;

    const requiresTwoFactor =
      scope === "admin" ? true : isUserTwoFactorRequired;
    if (!requiresTwoFactor) {
      const session = await createSession({
        userId: user.id,
        ip,
        userAgent: ua,
      });
      await setSessionCookie(session.rawToken, session.expiresAt, {
        sessionOnly: scope === "user" && isRegularUser,
      });
      await clearPending2faCookie();

      if (scope === "user" && isRegularUser) {
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

      return { ok: true as const, step: "done" as const };
    }

    try {
      const { tokenId, expiresAt } = await startEmail2fa(user.id, user.email);
      await setPending2faCookie(`${user.id}:${tokenId}`, 10);
      return { ok: true as const, step: "2fa" as const, expiresAt };
    } catch (error) {
      await auditAuth({
        type: "LOGIN_OTP_SENT",
        success: false,
        reason: "otp_send_failed",
        email: user.email,
        userId: user.id,
        ip,
        userAgent: ua,
      });
      await clearPending2faCookie();
      await logExternalServiceError({
        source: "SMTP",
        type: "OTP_SEND",
        message:
          error instanceof Error ? error.message : "Failed to send OTP email",
      });
      return { ok: false as const, step: "login" as const };
    }
  } catch (error) {
    await logExternalServiceError({
      source: "AUTH",
      type: "LOGIN_START",
      message:
        error instanceof Error ? error.message : "Unexpected login error",
    });
    return { ok: false as const, step: "login" as const };
  }
}
