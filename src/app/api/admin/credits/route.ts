import { NextResponse } from "next/server";
import { hasRole } from "@/lib/auth/rbac";
import { getCurrentUser } from "@/lib/auth/require";
import { didService } from "@/lib/services/did.service";

export const runtime = "nodejs";

type DidCredit = {
  remaining?: number;
  total?: number;
  expire_at?: string;
};

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!hasRole(session.user.roles, "ADMIN")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const payload = await didService.getCredits();
    const credits = Array.isArray(payload?.credits) ? payload.credits : [];
    const normalized = credits as DidCredit[];
    let remainingTotal = 0;
    let total = 0;
    let nextExpire: string | null = null;
    for (const item of normalized) {
      const remaining = Number(item.remaining ?? 0);
      const totalItem = Number(item.total ?? 0);
      if (!Number.isNaN(remaining)) remainingTotal += remaining;
      if (!Number.isNaN(totalItem)) total += totalItem;
      if (item.expire_at) {
        if (!nextExpire) {
          nextExpire = item.expire_at;
        } else if (new Date(item.expire_at) < new Date(nextExpire)) {
          nextExpire = item.expire_at;
        }
      }
    }

    return NextResponse.json({
      remaining: remainingTotal,
      total,
      expireAt: nextExpire,
    });
  } catch (error) {
    console.error("Failed to fetch credits:", error);
    return NextResponse.json({ error: "FAILED" }, { status: 500 });
  }
}
