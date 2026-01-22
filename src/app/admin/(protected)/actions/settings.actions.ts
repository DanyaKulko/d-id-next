"use server";

import { revalidatePath } from "next/cache";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { prisma } from "@/lib/db/prisma";
import { externalSourcesSeeds } from "@/lib/external-sources/config";
import { didService } from "@/lib/services/did.service";
import { getAzureSpeechToken } from "@/app/actions/azure.actions";
import {
  authRequiredKey,
  getOptionalString,
  getString,
  requireAdmin,
  withDidLogging,
} from "./shared";

export async function checkDidConnectionAction() {
  await requireAdmin();
  await withDidLogging("Check Status", () => didService.checkStatus());
  return { ok: true };
}

export async function checkAzureConnectionAction() {
  await requireAdmin();
  const result = await getAzureSpeechToken();
  if (!result || "error" in result || !result.token) {
    throw new Error(result?.error ?? "Azure Speech token failed");
  }
  return { ok: true, region: result.region };
}

export async function saveExternalSourcesConfigAction(formData: FormData) {
  await requireAdmin();
  const textAccessKey = getString(formData.get("textAccessKey")).trim();
  const videoAccessKey = getString(formData.get("videoAccessKey")).trim();

  const textSeed = externalSourcesSeeds.find((item) => item.kind === "TEXT");
  const videoSeed = externalSourcesSeeds.find((item) => item.kind === "VIDEO");

  await prisma.externalSource.upsert({
    where: { kind: "TEXT" },
    update: { accessKey: textAccessKey },
    create: {
      kind: "TEXT",
      label: textSeed?.label ?? "Text blog",
      link: textSeed?.link ?? "",
      cron: textSeed?.cron ?? "",
      accessKey: textAccessKey,
    },
  });

  await prisma.externalSource.upsert({
    where: { kind: "VIDEO" },
    update: { accessKey: videoAccessKey },
    create: {
      kind: "VIDEO",
      label: videoSeed?.label ?? "Video transcripts",
      link: videoSeed?.link ?? "",
      cron: videoSeed?.cron ?? "",
      accessKey: videoAccessKey,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/external-sources");
  return { ok: true };
}

export async function saveUserUpdateAction(formData: FormData) {
  await requireAdmin();
  const action = getString(formData.get("action"));

  if (action === "create") {
    const email = getString(formData.get("email")).trim().toLowerCase();
    const password = getString(formData.get("password"));
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const user = await prisma.user.findFirst({ where: { email } });
    if (user) {
      throw new Error("User with this email already exists");
    }

    const hash = await hashPassword(password);

    const created = await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        roles: { create: [{ role: "USER" }] },
      },
    });

    await prisma.loginEvent.create({
      data: {
        type: "ADMIN_USER_CREATE",
        success: true,
        email,
        userId: created.id,
      },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/user-access");
    return { ok: true };
  }

  if (action === "update") {
    const userId = getString(formData.get("userId")).trim();
    const email = getString(formData.get("email")).trim().toLowerCase();
    const password = getOptionalString(formData.get("password"));

    if (!userId || !email) {
      throw new Error("User id and email are required");
    }

    if (password && password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const isAdmin = await prisma.userRole.findFirst({
      where: { userId, role: "ADMIN" },
    });
    if (isAdmin) {
      throw new Error("Cannot edit admin users here");
    }

    const updateData: { email: string; passwordHash?: string } = { email };
    if (password) {
      updateData.passwordHash = await hashPassword(password);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    await prisma.loginEvent.create({
      data: {
        type: "ADMIN_USER_UPDATE",
        success: true,
        email,
        userId,
      },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/user-access");
    return { ok: true };
  }

  if (action === "toggle-status") {
    const userId = getString(formData.get("userId")).trim();
    if (!userId) throw new Error("User id is required");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const isAdmin = await prisma.userRole.findFirst({
      where: { userId, role: "ADMIN" },
    });
    if (isAdmin) {
      throw new Error("Cannot edit admin users here");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
    });

    await prisma.loginEvent.create({
      data: {
        type: "ADMIN_USER_UPDATE",
        success: true,
        email: user.email,
        userId,
      },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/user-access");
    return { ok: true };
  }

  if (action === "delete") {
    const userId = getString(formData.get("userId")).trim();
    if (!userId) throw new Error("User id is required");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const isAdmin = await prisma.userRole.findFirst({
      where: { userId, role: "ADMIN" },
    });
    if (isAdmin) {
      throw new Error("Cannot delete admin users here");
    }

    await prisma.user.delete({ where: { id: userId } });

    await prisma.loginEvent.create({
      data: {
        type: "ADMIN_USER_DELETE",
        success: true,
        email: user.email,
        userId,
      },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/user-access");
    return { ok: true };
  }

  throw new Error("Unsupported action");
}

export async function saveAuthRequirementAction(formData: FormData) {
  await requireAdmin();
  const enabled = getString(formData.get("enabled")).trim();
  await prisma.appSetting.upsert({
    where: { key: authRequiredKey },
    update: { value: enabled },
    create: { key: authRequiredKey, value: enabled },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/user-access");
  return { ok: true };
}

export async function saveAdminCredentialsAction(formData: FormData) {
  await requireAdmin();
  const email = getString(formData.get("email")).trim().toLowerCase();
  const currentPassword = getString(formData.get("currentPassword"));
  const newPassword = getString(formData.get("newPassword"));

  if (!email) {
    throw new Error("Email is required");
  }

  const admin = await prisma.user.findFirst({
    where: { roles: { some: { role: "ADMIN" } } },
  });

  if (!admin) {
    throw new Error("Admin user not found");
  }

  const valid = await verifyPassword(admin.passwordHash, currentPassword);
  if (!valid) {
    return { ok: false, error: "Incorrect current password" };
  }

  const updateData: { email?: string; passwordHash?: string } = {};
  if (email !== admin.email) {
    updateData.email = email;
  }
  if (newPassword) {
    updateData.passwordHash = await hashPassword(newPassword);
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.user.update({
      where: { id: admin.id },
      data: updateData,
    });
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/admin-credentials");
  return { ok: true };
}
