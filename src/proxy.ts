import { type NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;

    const isAdmin = pathname.startsWith("/admin");
    if (!isAdmin) return NextResponse.next();
    if (pathname === "/admin/login") return NextResponse.next();

    const hasSession = Boolean(req.cookies.get("session")?.value);
    if (!hasSession) {
        const url = new URL("/admin/login", req.url);
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/admin((?!/login$).*)"],
};
