import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/require";
import LoginClient from "./login-client";
import "./page.css";

type LoginPageProps = {
  searchParams?: { next?: string };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getCurrentUser();
  if (session) {
    const nextUrl = searchParams?.next;
    redirect(nextUrl?.startsWith("/") ? nextUrl : "/");
  }

  return <LoginClient />;
}
