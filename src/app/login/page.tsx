import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import LoginClient from "./login-client";
import "./page.css";

type LoginPageProps = {
  searchParams?: Promise<{ next?: string | string[] }>;
};

const userTwoFactorRequiredKey = "requireUserTwoFactorAuthentication";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getCurrentUser();
  if (session) {
    const rawNext = resolvedSearchParams?.next;
    const nextUrl = Array.isArray(rawNext) ? rawNext[0] : rawNext;
    redirect(nextUrl?.startsWith("/") ? nextUrl : "/");
  }

  const twoFactorSetting = await prisma.appSetting.findUnique({
    where: { key: userTwoFactorRequiredKey },
    select: { value: true },
  });
  const twoFactorRequired = twoFactorSetting
    ? twoFactorSetting.value === "true"
    : true;

  return <LoginClient twoFactorRequired={twoFactorRequired} />;
}
