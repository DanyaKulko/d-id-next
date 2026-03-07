import { type NextRequest, NextResponse } from "next/server";

const getAllowedAdminHosts = () =>
  (process.env.ADMIN_HOSTS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const normalizeHost = (value: string) => value.trim().toLowerCase().split(":")[0] ?? "";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  if (process.env.NODE_ENV === "production") {
    const allowedHosts = getAllowedAdminHosts();
    const host = normalizeHost(
      req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "",
    );

    if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
      return new NextResponse("Not Found", { status: 404 });
    }
  }

  if (isAdminApi || pathname === "/admin/login") {
    return NextResponse.next();
  }

  const hasSession = Boolean(req.cookies.get("session")?.value);
  if (!hasSession) {
    const url = new URL("/admin/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
