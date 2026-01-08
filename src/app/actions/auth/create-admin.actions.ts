"use server";

import { hashPassword } from "@/lib/auth/passwords";
import { prisma } from "@/lib/db/prisma";

export async function createAdmin() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  const email = process.env.SEED_ADMIN_EMAIL;
  if (!password || !email) {
    throw new Error("SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD is missing");
  }

  const passwordHash = await hashPassword(password);

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
