export async function verifyRecaptcha(token: string, ip?: string) {
    if (process.env.NODE_ENV !== "production") return { ok: true as const };

    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) return { ok: false as const, reason: "missing_secret" as const };

    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);

    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
    });

    const data = (await r.json()) as { success: boolean };
    if (!data.success) return { ok: false as const, reason: "failed" as const };

    return { ok: true as const };
}
