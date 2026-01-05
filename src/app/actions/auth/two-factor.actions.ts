"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { getPending2faCookie, clearPending2faCookie, setSessionCookie } from "@/lib/auth/cookies";
import { verifyEmail2fa } from "@/lib/auth/twofactor";
import { createSession } from "@/lib/auth/session";
import {auditAuth} from "@/lib/audit/auth";

const Schema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function twoFactorVerify(input: unknown) {
    const { code } = Schema.parse(input);

    const pending = await getPending2faCookie();
    if (!pending) {
        await auditAuth({ type: "LOGIN_OTP_VERIFY", success: false, reason: "missing_pending" });
        return { ok: false as const, reason: "missing_pending" as const };
    }

    const [userId, tokenId] = pending.split(":");
    if (!userId || !tokenId) {
        await auditAuth({ type: "LOGIN_OTP_VERIFY", success: false, reason: "invalid_pending", userId });
        return { ok: false as const, reason: "invalid_pending" as const };
    }

    const v = await verifyEmail2fa({ userId, tokenId, code });

    const rawHeaders = await headers()
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

    const session = await createSession({ userId, ip, userAgent: ua });
    await setSessionCookie(session.rawToken, session.expiresAt);
    await clearPending2faCookie();

    return { ok: true as const };
}
