import { NextResponse } from "next/server";
import { clearWebSessionCookie } from "@/lib/auth/cookies";
import { isClientAuthRequired } from "@/lib/auth/client-access";
import { getCurrentUser } from "@/lib/auth/require";
import { touchUserWebSession } from "@/lib/auth/user-web-session";

export const runtime = "nodejs";

const isRegularUserRoles = (roles: string[]) =>
  roles.includes("USER") && !roles.includes("ADMIN");

const resolveIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

export async function POST(request: Request) {
  if (!(await isClientAuthRequired())) {
    await clearWebSessionCookie();
    return NextResponse.json({ ok: true, tracked: false });
  }

  const session = await getCurrentUser().catch(() => null);
  if (!session) {
    await clearWebSessionCookie();
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!isRegularUserRoles(session.user.roles)) {
    await clearWebSessionCookie();
    return NextResponse.json({ ok: true, tracked: false });
  }

  const result = await touchUserWebSession({
    user: session.user,
    ip: resolveIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, ...result });
}
