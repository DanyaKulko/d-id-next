"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type SettingsTabId,
  settingsTabs,
  settingsTabTitles,
} from "./settings.tabs";

const defaultTab: SettingsTabId = "integrations";

const resolveActiveTab = (pathname: string | null): SettingsTabId => {
  if (!pathname) return defaultTab;
  const parts = pathname.split("/").filter(Boolean);
  const maybeTab = parts.at(-1);
  return settingsTabs.includes(maybeTab as SettingsTabId)
    ? (maybeTab as SettingsTabId)
    : defaultTab;
};

export default function SettingsHeader() {
  const pathname = usePathname();
  const activeTab = resolveActiveTab(pathname);
  const title = settingsTabTitles[activeTab] ?? "Settings";

  return (
    <>
      <div className="breadcrumbs">
        <div className="breadcrumb-item">Settings</div>
        <span className="breadcrumb-separator">›</span>
        <div className="breadcrumb-item" id="current-section">
          {title}
        </div>
      </div>

      <h1 className="page-title">{title}</h1>

      <div className="tabs">
        {settingsTabs.map((tab) => (
          <Link
            key={tab}
            href={`/admin/settings/${tab}`}
            className={`tab ${tab === activeTab ? "active" : ""}`}
            aria-current={tab === activeTab ? "page" : undefined}
          >
            {settingsTabTitles[tab]}
          </Link>
        ))}
      </div>
    </>
  );
}
