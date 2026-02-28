import crypto from "node:crypto";
import { auditAuth } from "@/lib/audit/auth";
import { prisma } from "@/lib/db/prisma";
import { sendNeilUserLogoutEmail } from "@/lib/email/smtp";
import { logExternalServiceError } from "@/lib/logging/external-errors";

const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);
const ROLLING_DAYS = Number(process.env.SESSION_ROLLING_DAYS ?? 7);

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("base64url");
}
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export type SessionUser = { id: string; email: string; roles: string[] };

const isRegularUserRoles = (roles: string[]) =>
  roles.includes("USER") && !roles.includes("ADMIN");

export async function createSession(params: {
  userId: string;
  ip?: string;
  userAgent?: string;
}) {
  const raw = randomToken(32);
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId: params.userId,
      tokenHash,
      expiresAt,
      ip: params.ip,
      userAgent: params.userAgent,
    },
  });

  return { rawToken: raw, expiresAt };
}

export async function revokeSession(rawToken: string) {
  const tokenHash = sha256(rawToken);
  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getSession(rawToken: string) {
  const tokenHash = sha256(rawToken);

  const s = await prisma.session.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          isActive: true,
          roles: { select: { role: true } },
        },
      },
    },
  });

  if (!s) {
    const expired = await prisma.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { lte: new Date() } },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            email: true,
            roles: { select: { role: true } },
          },
        },
      },
    });

    if (expired?.id && expired.user) {
      await prisma.session
        .update({
          where: { id: expired.id },
          data: { revokedAt: new Date() },
        })
        .catch(() => undefined);

      const roles = expired.user.roles.map((item) => item.role);
      await auditAuth({
        type: "LOGOUT",
        success: true,
        reason: "session_expired",
        email: expired.user.email,
        userId: expired.user.id,
      }).catch(() => undefined);

      if (isRegularUserRoles(roles)) {
        await sendNeilUserLogoutEmail(expired.user.email).catch(
          async (error) => {
            await logExternalServiceError({
              source: "SMTP",
              type: "USER_EXPIRED_SESSION_NOTIFY",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to send expired-session notification",
              level: "WARNING",
            });
          },
        );
      }
    }

    return null;
  }
  if (!s.user.isActive) return null;

  return {
    sessionId: s.id,
    expiresAt: s.expiresAt,
    user: {
      id: s.user.id,
      email: s.user.email,
      roles: s.user.roles.map((r) => r.role),
    } satisfies SessionUser,
    tokenHash,
  };
}

export function shouldRoll(expiresAt: Date) {
  const rollWindowMs = ROLLING_DAYS * 24 * 60 * 60 * 1000;
  return expiresAt.getTime() - Date.now() < rollWindowMs;
}

export async function rollSession(tokenHash: string) {
  const newExpiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { expiresAt: newExpiresAt },
  });
  return newExpiresAt;
}
