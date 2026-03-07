import { NextResponse } from "next/server";
import { endCurrentUserWebSession } from "@/lib/auth/user-web-session";

export const runtime = "nodejs";

const resolveReason = async (request: Request) => {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return "CLIENT_END";
  }
  const reason = (payload as { reason?: unknown }).reason;
  return typeof reason === "string" && reason.trim()
    ? reason.trim()
    : "CLIENT_END";
};

export async function POST(request: Request) {
  const result = await endCurrentUserWebSession(await resolveReason(request));
  return NextResponse.json({ ok: true, ...result });
}
