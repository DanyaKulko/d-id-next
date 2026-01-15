"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auditAuth } from "@/lib/audit/auth";
import { setPending2faCookie, setSessionCookie } from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/passwords";
import { createSession } from "@/lib/auth/session";
import { startEmail2fa } from "@/lib/auth/twofactor";
import { prisma } from "@/lib/db/prisma";
import { verifyRecaptcha } from "@/lib/security/recaptcha";

const Schema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(6).max(200),
  // password: z.string().min(8).max(200),
  recaptchaToken: z.string().optional(),
});

export async function loginStart(input: unknown) {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
      console.log('Login input validation failed:', parsed.error);
    return { ok: false as const, step: "login" as const };
  }
  const { email, password, recaptchaToken } = parsed.data;

  const rawHeaders = await headers();
  const ip = rawHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ua = rawHeaders.get("user-agent") ?? undefined;

    console.log({ email, password, recaptchaToken })
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
      console.log(`Login failed: recaptcha failed for email ${email}`);
      return { ok: false as const, step: "login" as const };
    }
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      twoFactorEmail: true,
      isActive: true,
    },
  });
    console.log('user fetched for email', email, ':', user);
  if (!user) {
    await auditAuth({
      type: "LOGIN_PASSWORD",
      success: false,
      reason: "user_not_found",
      email,
      ip,
      userAgent: ua,
    });
    console.log(`Login failed: user not found for email ${email}`);
    return { ok: false as const, step: "login" as const };
  }
    console.log(123123123)
  if (!user.isActive) {
      console.log('User inactive:', email);
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
    console.log(1)
  const okPwd = await verifyPassword(user.passwordHash, password);
    console.log('Password verification result for', email, ':', okPwd);
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

  if (user.twoFactorEmail) {
    const { tokenId, expiresAt } = await startEmail2fa(user.id, user.email);
    await setPending2faCookie(`${user.id}:${tokenId}`, 10);
    return { ok: true as const, step: "2fa" as const, expiresAt };
  }

  const session = await createSession({ userId: user.id, ip, userAgent: ua });
  await setSessionCookie(session.rawToken, session.expiresAt);

  return { ok: true as const, step: "done" as const };
}
