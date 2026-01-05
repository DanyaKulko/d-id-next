"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require";
import { verifyPassword, hashPassword } from "@/lib/auth/passwords";
import { createSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";

const Schema = z.object({
    oldPassword: z.string().min(8).max(200),
    newPassword: z.string().min(10).max(200),
});

export async function changePassword(input: unknown) {
    const { oldPassword, newPassword } = Schema.parse(input);
    const user = await requireUser();

    const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true },
    });
    if (!dbUser) throw new Error("UNAUTHORIZED");

    const ok = await verifyPassword(dbUser.passwordHash, oldPassword);
    if (!ok) return { ok: false as const, reason: "wrong_old_password" as const };

    const newHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
        await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    });

    const session = await createSession({ userId: user.id });
    await setSessionCookie(session.rawToken, session.expiresAt);

    return { ok: true as const };
}
