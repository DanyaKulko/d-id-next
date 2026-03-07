import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";

const authRequiredKey = "requireAuthentication";

export async function isClientAuthRequired() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: authRequiredKey },
    select: { value: true },
  });
  return setting?.value === "true";
}

export async function enforceClientAuth(pathname: string) {
  if (!(await isClientAuthRequired())) return;

  const session = await getCurrentUser();
  if (session) return;

  const nextPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}

export async function ensureClientAuth() {
  if (!(await isClientAuthRequired())) return;

  const session = await getCurrentUser();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
}
