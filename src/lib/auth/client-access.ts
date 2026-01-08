import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";

const authRequiredKey = "requireAuthentication";

export async function enforceClientAuth(pathname: string) {
  const setting = await prisma.appSetting.findUnique({
    where: { key: authRequiredKey },
  });
  if (setting?.value !== "true") return;

  const session = await getCurrentUser();
  if (session) return;

  const nextPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}

export async function ensureClientAuth() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: authRequiredKey },
  });
  if (setting?.value !== "true") return;

  const session = await getCurrentUser();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
}
