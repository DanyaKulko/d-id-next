"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export default function TrainingHeader() {
  const pathname = usePathname();
  const activeTab = resolveActiveTab(pathname);
  const title = trainingTabTitles[activeTab] ?? "Training";

  return (
    <>
      <div className="breadcrumbs">
        <div className="breadcrumb-item">Training</div>
        <span className="breadcrumb-separator">›</span>
        <div className="breadcrumb-item" id="current-section">
          {title}
        </div>
      </div>

      <h1 className="page-title">{title}</h1>

      <div className="tabs">
        {trainingTabs.map((tab) => (
          <Link
            key={tab}
            href={`/admin/training/${tab}`}
            className={`tab ${tab === activeTab ? "active" : ""}`}
            aria-current={tab === activeTab ? "page" : undefined}
          >
            {tabIcons[tab]} {trainingTabTitles[tab]}
          </Link>
        ))}
      </div>
    </>
  );
}
