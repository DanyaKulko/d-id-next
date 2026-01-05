"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/passwords";
import { createSession } from "@/lib/auth/session";
import { setPending2faCookie, setSessionCookie } from "@/lib/auth/cookies";
import { startEmail2fa } from "@/lib/auth/twofactor";
import { verifyRecaptcha } from "@/lib/security/recaptcha";
import {auditAuth} from "@/lib/audit/auth";

const Schema = z.object({
    email: z.email().toLowerCase(),
    password: z.string().min(6).max(200),
    // password: z.string().min(8).max(200),
    recaptchaToken: z.string().optional(),
});

export async function loginStart(input: unknown) {
    const { email, password, recaptchaToken } = Schema.parse(input);

    const rawHeaders = await headers()
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
            console.log(`Login failed: recaptcha failed for email ${email}`);
            return {ok: false as const, step: "login" as const};
        }
    }

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true, twoFactorEmail: true },
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
        console.log(`Login failed: user not found for email ${email}`);
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

    if (user.twoFactorEmail) {
        const { tokenId, expiresAt } = await startEmail2fa(user.id, user.email);
        await setPending2faCookie(`${user.id}:${tokenId}`, 10);
        return { ok: true as const, step: "2fa" as const, expiresAt };
    }

    const session = await createSession({ userId: user.id, ip, userAgent: ua });
    await setSessionCookie(session.rawToken, session.expiresAt);

    return { ok: true as const, step: "done" as const };
}
