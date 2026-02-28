import { cookies } from "next/headers";

export const SESSION_COOKIE = "session";
export const PENDING_2FA_COOKIE = "pending_2fa";

const base = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function getSessionCookie() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}
export async function setSessionCookie(
  rawToken: string,
  expiresAt: Date,
  options?: { sessionOnly?: boolean },
) {
  const sessionOnly = options?.sessionOnly ?? false;
  (await cookies()).set(
    SESSION_COOKIE,
    rawToken,
    sessionOnly
      ? {
          ...base,
        }
      : {
          ...base,
          expires: expiresAt,
        },
  );
}
export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, "", { ...base, expires: new Date(0) });
}

export async function getPending2faCookie() {
  return (await cookies()).get(PENDING_2FA_COOKIE)?.value ?? null;
}
export async function setPending2faCookie(value: string, ttlMinutes = 10) {
  (await cookies()).set(PENDING_2FA_COOKIE, value, {
    ...base,
    expires: new Date(Date.now() + ttlMinutes * 60 * 1000),
  });
}
export async function clearPending2faCookie() {
  (await cookies()).set(PENDING_2FA_COOKIE, "", {
    ...base,
    expires: new Date(0),
  });
}
