import crypto from "node:crypto";
import { clearWebSessionCookie, getWebSessionCookie, setWebSessionCookie } from "@/lib/auth/cookies";
import { isClientAuthRequired } from "@/lib/auth/client-access";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { sendNeilUserLoginEmail, sendNeilUserLogoutEmail } from "@/lib/email/smtp";
import { logExternalServiceError } from "@/lib/logging/external-errors";

const USER_WEB_SESSION_IDLE_MINUTES = Number(
  process.env.USER_WEB_SESSION_IDLE_MINUTES ?? 5,
);
const USER_WEB_SESSION_IDLE_MS = Math.max(
  USER_WEB_SESSION_IDLE_MINUTES,
  1,
) * 60 * 1000;

const isRegularUserRoles = (roles: string[]) =>
  roles.includes("USER") && !roles.includes("ADMIN");

const sha256 = (input: string) =>
  crypto.createHash("sha256").update(input).digest("base64url");

const randomToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("base64url");

const staleBefore = () => new Date(Date.now() - USER_WEB_SESSION_IDLE_MS);

const notifyNeilSessionStart = async (email: string) => {
  await sendNeilUserLoginEmail(email).catch(async (error) => {
    await logExternalServiceError({
      source: "SMTP",
      type: "USER_WEB_SESSION_START_NOTIFY",
      message:
        error instanceof Error
          ? error.message
          : "Failed to send user session start notification",
      level: "WARNING",
    });
  });
};

const notifyNeilSessionEnd = async (email: string) => {
  await sendNeilUserLogoutEmail(email).catch(async (error) => {
    await logExternalServiceError({
      source: "SMTP",
      type: "USER_WEB_SESSION_END_NOTIFY",
      message:
        error instanceof Error
          ? error.message
          : "Failed to send user session end notification",
      level: "WARNING",
    });
  });
};

const closeSessions = async (
  sessions: Array<{
    id: string;
    user: { email: string; roles: Array<{ role: string }> };
  }>,
  reason: string,
) => {
  for (const session of sessions) {
    const updated = await prisma.userWebSession.updateMany({
      where: { id: session.id, endedAt: null },
      data: { endedAt: new Date(), endReason: reason },
    });
    if (updated.count === 0) continue;

    const roles = session.user.roles.map((item) => item.role);
    if (isRegularUserRoles(roles)) {
      await notifyNeilSessionEnd(session.user.email);
    }
  }
};

export async function cleanupStaleUserWebSessions() {
  const sessions = await prisma.userWebSession.findMany({
    where: {
      endedAt: null,
      lastSeenAt: { lt: staleBefore() },
    },
    select: {
      id: true,
      user: {
        select: {
          email: true,
          roles: { select: { role: true } },
        },
      },
    },
  });

  if (sessions.length === 0) {
    return 0;
  }

  await closeSessions(sessions, "IDLE_TIMEOUT");
  return sessions.length;
}

export async function touchUserWebSession(params: {
  user: SessionUser;
  ip?: string | null;
  userAgent?: string | null;
}) {
  if (!(await isClientAuthRequired()) || !isRegularUserRoles(params.user.roles)) {
    await clearWebSessionCookie();
    return { tracked: false, started: false };
  }

  await cleanupStaleUserWebSessions();

  const rawCookie = await getWebSessionCookie();
  const now = new Date();

  if (rawCookie) {
    const tokenHash = sha256(rawCookie);
    const current = await prisma.userWebSession.findFirst({
      where: {
        tokenHash,
        userId: params.user.id,
      },
      select: {
        id: true,
        endedAt: true,
      },
    });

    if (current && !current.endedAt) {
      await prisma.userWebSession
        .update({
          where: { id: current.id },
          data: {
            lastSeenAt: now,
            ip: params.ip ?? undefined,
            userAgent: params.userAgent ?? undefined,
          },
        })
        .catch(() => undefined);

      return { tracked: true, started: false };
    }

    await clearWebSessionCookie();
  }

  const rawToken = randomToken();
  const tokenHash = sha256(rawToken);

  await prisma.userWebSession.create({
    data: {
      userId: params.user.id,
      tokenHash,
      ip: params.ip ?? undefined,
      userAgent: params.userAgent ?? undefined,
      lastSeenAt: now,
    },
  });

  await setWebSessionCookie(rawToken);
  await notifyNeilSessionStart(params.user.email);

  return { tracked: true, started: true };
}

export async function endCurrentUserWebSession(reason: string) {
  const rawCookie = await getWebSessionCookie();
  if (!rawCookie) {
    await clearWebSessionCookie();
    return { ended: false };
  }

  const tokenHash = sha256(rawCookie);
  const session = await prisma.userWebSession.findFirst({
    where: {
      tokenHash,
      endedAt: null,
    },
    select: {
      id: true,
      user: {
        select: {
          email: true,
          roles: { select: { role: true } },
        },
      },
    },
  });

  await clearWebSessionCookie();

  if (!session) {
    return { ended: false };
  }

  await closeSessions([session], reason);
  return { ended: true };
}

export async function endAllUserWebSessions(userId: string, reason: string) {
  const sessions = await prisma.userWebSession.findMany({
    where: {
      userId,
      endedAt: null,
    },
    select: {
      id: true,
      user: {
        select: {
          email: true,
          roles: { select: { role: true } },
        },
      },
    },
  });

  if (sessions.length === 0) {
    return 0;
  }

  await closeSessions(sessions, reason);
  return sessions.length;
}
