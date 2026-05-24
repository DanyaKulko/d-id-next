"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAzureSpeechToken } from "@/app/actions/azure.actions";
import { setSessionCookie } from "@/lib/auth/cookies";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { createSession, revokeAllUserSessions } from "@/lib/auth/session";
import { endAllUserWebSessions } from "@/lib/auth/user-web-session";
import { prisma } from "@/lib/db/prisma";
import { externalSourcesSeeds } from "@/lib/external-sources/config";
import { didService } from "@/lib/services/did.service";
import {
  authRequiredKey,
  getOptionalString,
  getString,
  requireAdmin,
  userTwoFactorRequiredKey,
  withDidLogging,
} from "./shared";

const formatDateOnly = (date: Date) => date.toISOString().split("T")[0];

const normalizeUsername = (raw: string): string => raw.trim();

// Usernames: 3-30 chars, letters/digits/._- and no "@" (to avoid colliding
// with the email format used by the same login field).
const isValidUsername = (value: string): boolean =>
  /^[a-zA-Z0-9._-]{3,30}$/.test(value);

const buildUserRow = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const lastLogin = await prisma.loginEvent.findFirst({
    where: {
      userId,
      success: true,
      type: "LOGIN_PASSWORD",
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return {
    id: user.id,
    login: user.username ?? user.email.split("@")[0] ?? user.email,
    email: user.email,
    username: user.username ?? null,
    createdDate: formatDateOnly(user.createdAt),
    lastLogin: lastLogin ? formatDateOnly(lastLogin.createdAt) : "Never",
    status: user.isActive ? ("active" as const) : ("inactive" as const),
  };
};

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
    const usernameRaw = getOptionalString(formData.get("username"));
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const username = usernameRaw ? normalizeUsername(usernameRaw) : null;
    if (username && !isValidUsername(username)) {
      throw new Error(
        "Username must be 3-30 chars: letters, digits, dot, dash or underscore",
      );
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(username
            ? [{ username: { equals: username, mode: "insensitive" as const } }]
            : []),
        ],
      },
      select: { email: true, username: true },
    });
    if (existing) {
      throw new Error(
        existing.email === email
          ? "User with this email already exists"
          : "User with this username already exists",
      );
    }

    const hash = await hashPassword(password);

    const created = await prisma.user.create({
      data: {
        email,
        username,
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
    return { ok: true, user: await buildUserRow(created.id) };
  }

  if (action === "update") {
    const userId = getString(formData.get("userId")).trim();
    const email = getString(formData.get("email")).trim().toLowerCase();
    const password = getOptionalString(formData.get("password"));
    const usernameRaw = getOptionalString(formData.get("username"));
    // Distinguish "field absent" from "explicitly cleared": when the form
    // sends the username field at all, we honor it (empty string → clear).
    const usernameProvided = formData.has("username");
    const username = usernameRaw ? normalizeUsername(usernameRaw) : null;

    if (!userId || !email) {
      throw new Error("User id and email are required");
    }

    if (password && password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    if (username && !isValidUsername(username)) {
      throw new Error(
        "Username must be 3-30 chars: letters, digits, dot, dash or underscore",
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const isAdmin = await prisma.userRole.findFirst({
      where: { userId, role: "ADMIN" },
    });
    if (isAdmin) {
      throw new Error("Cannot edit admin users here");
    }

    if (username) {
      const clash = await prisma.user.findFirst({
        where: {
          id: { not: userId },
          username: { equals: username, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (clash) {
        throw new Error("User with this username already exists");
      }
    }

    const updateData: {
      email: string;
      passwordHash?: string;
      username?: string | null;
    } = { email };
    if (usernameProvided) {
      updateData.username = username;
    }
    const hasPasswordChange = Boolean(password);
    if (hasPasswordChange) {
      updateData.passwordHash = await hashPassword(password as string);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    if (hasPasswordChange) {
      await revokeAllUserSessions(userId);
      await endAllUserWebSessions(userId, "ADMIN_PASSWORD_CHANGE");
    }

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
    return { ok: true, user: await buildUserRow(userId) };
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

    const nextIsActive = !user.isActive;
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: nextIsActive },
    });

    if (!nextIsActive) {
      await revokeAllUserSessions(userId);
      await endAllUserWebSessions(userId, "ADMIN_DEACTIVATE");
    }

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
    return { ok: true, user: await buildUserRow(userId) };
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

    await revokeAllUserSessions(userId);
    await endAllUserWebSessions(userId, "ADMIN_DELETE");

    await prisma.loginEvent.create({
      data: {
        type: "ADMIN_USER_DELETE",
        success: true,
        email: user.email,
        userId,
      },
    });

    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId } }),
      prisma.twoFactorToken.deleteMany({ where: { userId } }),
      prisma.userWebSession.deleteMany({ where: { userId } }),
      prisma.session.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/user-access");
    return { ok: true, deletedUserId: userId };
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

export async function saveUserTwoFactorRequirementAction(formData: FormData) {
  await requireAdmin();
  const enabled = getString(formData.get("enabled")).trim();
  await prisma.appSetting.upsert({
    where: { key: userTwoFactorRequiredKey },
    update: { value: enabled },
    create: { key: userTwoFactorRequiredKey, value: enabled },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/user-access");
  revalidatePath("/login");
  return { ok: true };
}

export async function saveAdminCredentialsAction(formData: FormData) {
  const currentAdmin = await requireAdmin();
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
  const hasPasswordChange = Boolean(newPassword);
  if (email !== admin.email) {
    updateData.email = email;
  }
  if (hasPasswordChange) {
    updateData.passwordHash = await hashPassword(newPassword);
  }

  if (Object.keys(updateData).length > 0) {
    if (hasPasswordChange) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: admin.id },
          data: updateData,
        });
        await tx.session.updateMany({
          where: { userId: admin.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      });

      const rawHeaders = await headers();
      const ip = rawHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
      const userAgent = rawHeaders.get("user-agent") ?? undefined;
      const session = await createSession({
        userId: currentAdmin.id,
        ip,
        userAgent,
      });
      await setSessionCookie(session.rawToken, session.expiresAt);
    } else {
      await prisma.user.update({
        where: { id: admin.id },
        data: updateData,
      });
    }
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/admin-credentials");
  return { ok: true };
}

export async function verifyAdminPasswordAction(formData: FormData) {
  await requireAdmin();
  const password = getString(formData.get("password"));
  if (!password) {
    return { ok: false, error: "Password is required" };
  }

  const admin = await prisma.user.findFirst({
    where: { roles: { some: { role: "ADMIN" } } },
  });

  if (!admin) {
    return { ok: false, error: "Admin user not found" };
  }

  const valid = await verifyPassword(admin.passwordHash, password);
  if (!valid) {
    return { ok: false, error: "Incorrect password" };
  }

  return { ok: true };
}
