"use server";

import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/passwords";

export async function createAdmin() {
    const passwordHash = await hashPassword(process.env.SEED_ADMIN_PASSWORD!);
    const email = process.env.SEED_ADMIN_EMAIL!;

    const user = await prisma.user.upsert({
        where: { email },
        update: { passwordHash, twoFactorEmail: true },
        create: {
            email,
            passwordHash,
            twoFactorEmail: true,
            roles: { create: [{ role: "ADMIN" }] },
        },
        select: { id: true, email: true },
    });

    return { ok: true as const, user };
}
