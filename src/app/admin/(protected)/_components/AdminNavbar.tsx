"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Toaster } from "react-hot-toast";
import { logout } from "@/app/actions/auth/logout.actions";

export default function AdminNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, startLogoutTransition] = useTransition();
  const [creditsStatus, setCreditsStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [credits, setCredits] = useState<{
    remaining: number;
    total: number;
    expireAt?: string | null;
  } | null>(null);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) ? "active" : "";

  useEffect(() => {
    let cancelled = false;
    const loadCredits = async () => {
      try {
        const response = await fetch("/api/admin/credits");
        if (!response.ok) throw new Error("Failed to load credits");
        const data = (await response.json()) as {
          remaining?: number;
          total?: number;
          expireAt?: string | null;
        };
        if (cancelled) return;
        setCredits({
          remaining: Number(data.remaining ?? 0),
          total: Number(data.total ?? 0),
          expireAt: data.expireAt ?? null,
        });
        setCreditsStatus("ready");
      } catch {
        if (cancelled) return;
        setCreditsStatus("error");
      }
    };
    loadCredits();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <nav className="gokhale-navbar">
        <div className="gokhale-navbar-container">
          <Link href="/admin/roles" className="gokhale-logo">
            <div className="gokhale-logo-icon">
              <Image
                src="https://roliki.ua/s/ChatGPT-Image-29-%D0%BD%D0%BE%D1%8F%D0%B1.-2025-%D0%B3.-14_23_51-%D0%9E%D1%82%D1%80%D0%B5%D0%B4%D0%B0%D0%BA%D1%82%D0%B8%D1%80%D0%BE%D0%B2%D0%B0%D0%BD%D0%BE.png"
                alt="Logo"
                width={40}
                height={40}
              />
            </div>
            <span>Gokhale CMS</span>
          </Link>
          <div className="gokhale-nav-center">
            <div className="gokhale-nav-credits">
              {creditsStatus === "loading" && (
                <div className="credits-pill credits-skeleton" />
              )}
              {creditsStatus === "error" && (
                <div className="credits-pill credits-error">Credits: —</div>
              )}
              {creditsStatus === "ready" && credits && (
                <div className="credits-pill">
                  <span>Credits</span>
                  <strong>
                    {credits.remaining.toFixed(1)}/{credits.total.toFixed(1)}
                  </strong>
                  {credits.expireAt && (
                    <span className="credits-expiry">
                      exp {new Date(credits.expireAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="gokhale-nav-right">
            <ul className="gokhale-nav-links">
              <li>
                <Link
                  href="/admin/roles"
                  className={`gokhale-nav-link ${isActive("/admin/roles")}`}
                >
                  <span className="icon">👤</span>
                  <span>Roles</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/training"
                  className={`gokhale-nav-link ${isActive("/admin/training")}`}
                >
                  <span className="icon">🎓</span>
                  <span>Training</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/settings"
                  className={`gokhale-nav-link ${isActive("/admin/settings")}`}
                >
                  <span className="icon">⚙️</span>
                  <span>Settings</span>
                </Link>
              </li>
            </ul>
            <button
              type="button"
              className="gokhale-logout-btn"
              disabled={isLoggingOut}
              aria-label={isLoggingOut ? "Signing out" : "Sign out"}
              title={isLoggingOut ? "Signing out..." : "Sign out"}
              onClick={() => {
                startLogoutTransition(async () => {
                  await logout().catch(() => undefined);
                  router.replace("/admin/login");
                  router.refresh();
                });
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="gokhale-logout-icon"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 7.5L6 12l4.5 4.5M6.5 12H20M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"
                />
              </svg>
            </button>
          </div>
        </div>
      </nav>
      <Toaster position="top-right" />
    </>
  );
}
