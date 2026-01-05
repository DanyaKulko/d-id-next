"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminNavbar() {
    const pathname = usePathname();

    const isActive = (href: string) => (pathname === href ? "active" : "");

    return (
        <nav className="gokhale-navbar">
            <div className="gokhale-navbar-container">
                <Link href="/admin" className="gokhale-logo">
                    <div className="gokhale-logo-icon">
                        <img
                            src="https://roliki.ua/s/ChatGPT-Image-29-%D0%BD%D0%BE%D1%8F%D0%B1.-2025-%D0%B3.-14_23_51-%D0%9E%D1%82%D1%80%D0%B5%D0%B4%D0%B0%D0%BA%D1%82%D0%B8%D1%80%D0%BE%D0%B2%D0%B0%D0%BD%D0%BE.png"
                            alt="Logo"
                            width={40}
                            height={40}
                        />
                    </div>
                    <span>Gokhale CMS</span>
                </Link>

                <ul className="gokhale-nav-links">
                    <li>
                        <Link href="/admin" className={`gokhale-nav-link ${isActive("/admin")}`}>
                            <span className="icon">👤</span>
                            <span>Roles</span>
                        </Link>
                    </li>
                    <li>
                        <Link href="/admin/training" className={`gokhale-nav-link ${isActive("/admin/training")}`}>
                            <span className="icon">🎓</span>
                            <span>Training</span>
                        </Link>
                    </li>
                    <li>
                        <Link href="/admin/settings" className={`gokhale-nav-link ${isActive("/admin/settings")}`}>
                            <span className="icon">⚙️</span>
                            <span>Settings</span>
                        </Link>
                    </li>
                </ul>
            </div>
        </nav>
    );
}
