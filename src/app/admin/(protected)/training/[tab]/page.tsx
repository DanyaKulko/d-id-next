import { redirect } from "next/navigation";
import {
  fetchKnowledgeArchive,
  fetchManualTrainingTemplate,
  fetchSafetyInstructions,
  type KnowledgeItem,
} from "@/app/admin/(protected)/admin-data";
import TrainingClient from "../training.client";
import {
  type TrainingTabId,
  trainingTabs,
  trainingTabTitles,
} from "../training.tabs";
import "../page.css";

type TrainingTabPageProps = {
  params: Promise<{ tab: string }>;
};

export default async function TrainingTabPage({
  params,
}: TrainingTabPageProps) {
  const { tab: rawTab } = await params;
  const tab = rawTab as TrainingTabId;
  if (!trainingTabs.includes(tab)) {
    redirect("/admin/training/archive");
  }

  const title = trainingTabTitles[tab];
  let knowledge: KnowledgeItem[] = [];
  let safetyRules = "";
  let manualText = "";

  if (tab === "archive") {
    knowledge = await fetchKnowledgeArchive();
  }

  if (tab === "safety") {
    safetyRules = await fetchSafetyInstructions();
  }

  if (tab === "manual") {
    manualText = await fetchManualTrainingTemplate();
  }

  return (
    <div className="container">
      <div className="breadcrumbs">
        <div className="breadcrumb-item">Training</div>
        <span className="breadcrumb-separator">›</span>
        <div className="breadcrumb-item" id="current-section">
          {title}
        </div>
      </div>

      <h1 className="page-title">{title}</h1>

      <TrainingClient
        key={tab}
        initialTab={tab}
        initialKnowledge={knowledge}
        initialSafetyRules={safetyRules}
        initialManualText={manualText}
      />
    </div>
  );
}
