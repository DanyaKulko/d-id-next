"use server";

import { getSessionCookie, clearSessionCookie } from "@/lib/auth/cookies";
import { revokeSession } from "@/lib/auth/session";

export async function logout() {
    const raw = await getSessionCookie();
    if (raw) await revokeSession(raw);
    await clearSessionCookie();
    return { ok: true as const };
}
