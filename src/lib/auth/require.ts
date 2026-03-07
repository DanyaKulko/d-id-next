import { getSessionCookie, setSessionCookie } from "@/lib/auth/cookies";
import { getSession, rollSession, shouldRoll } from "@/lib/auth/session";

export async function getCurrentUser() {
  const raw = await getSessionCookie();
  if (!raw) return null;

  const s = await getSession(raw);
  if (!s) return null;

  return { user: s.user, session: s };
}

export async function requireUser() {
  const x = await getCurrentUser();
  if (!x) throw new Error("UNAUTHORIZED");

  if (shouldRoll(x.session.expiresAt)) {
    const newExpiresAt = await rollSession(x.session.tokenHash);
    const sessionCookie = await getSessionCookie();
    if (!sessionCookie) {
      throw new Error("UNAUTHORIZED");
    }
    await setSessionCookie(sessionCookie, newExpiresAt);
  }

  return x.user;
}
