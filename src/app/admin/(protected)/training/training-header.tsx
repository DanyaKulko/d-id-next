"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { TrainingRoleOption } from "@/app/admin/(protected)/admin-data";
import {
  type TrainingTabId,
  trainingTabs,
  trainingTabTitles,
} from "./training.tabs";

const defaultTab: TrainingTabId = "archive";

const tabIcons: Record<TrainingTabId, string> = {
  archive: "📚",
  safety: "🛡️",
  manual: "✍️",
};

const resolveActiveTab = (pathname: string | null): TrainingTabId => {
  if (!pathname) return defaultTab;
  const parts = pathname.split("/").filter(Boolean);
  const maybeTab = parts.at(-1);
  return trainingTabs.includes(maybeTab as TrainingTabId)
    ? (maybeTab as TrainingTabId)
    : defaultTab;
};

type TrainingHeaderProps = {
  roles: TrainingRoleOption[];
};

export default function TrainingHeader({ roles }: TrainingHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = resolveActiveTab(pathname);
  const title = trainingTabTitles[activeTab] ?? "Training";
  const roleFromQuery = searchParams.get("role");
  const selectedRole =
    roles.find((role) => role.key === roleFromQuery) ?? roles[0] ?? null;
  const roleQuery = selectedRole
    ? `?role=${encodeURIComponent(selectedRole.key)}`
    : "";

  return (
    <>
      <div className="breadcrumbs">
        <div className="breadcrumb-item">Training</div>
        <span className="breadcrumb-separator">›</span>
        {selectedRole && (
          <>
            <div className="breadcrumb-item">{selectedRole.name}</div>
            <span className="breadcrumb-separator">›</span>
          </>
        )}
        <div className="breadcrumb-item" id="current-section">
          {title}
        </div>
      </div>

      <h1 className="page-title">
        {title}
        {selectedRole ? ` · ${selectedRole.name}` : ""}
      </h1>

      <div className="training-navigation-block">
        {roles.length > 0 && (
          <div className="role-tabs">
            {roles.map((role) => (
              <Link
                key={role.key}
                href={`/admin/training/${activeTab}?role=${encodeURIComponent(role.key)}`}
                className={`role-tab ${selectedRole?.key === role.key ? "active" : ""}`}
                aria-current={selectedRole?.key === role.key ? "page" : undefined}
              >
                {role.name}
              </Link>
            ))}
          </div>
        )}

        <div className="tabs">
          {trainingTabs.map((tab) => (
            <Link
              key={tab}
              href={`/admin/training/${tab}${roleQuery}`}
              className={`tab ${tab === activeTab ? "active" : ""}`}
              aria-current={tab === activeTab ? "page" : undefined}
            >
              {tabIcons[tab]} {trainingTabTitles[tab]}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
