import { redirect } from "next/navigation";
import {
  fetchKnowledgeArchive,
  fetchManualTrainingTemplate,
  fetchSafetyInstructions,
  fetchTextBlogEnabled,
  type KnowledgeItem,
} from "@/app/admin/(protected)/admin-data";
import TrainingClient from "../training.client";
import { type TrainingTabId, trainingTabs } from "../training.tabs";

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

  let knowledge: KnowledgeItem[] = [];
  let safetyRules = "";
  let manualText = "";
  let textBlogEnabled = true;

  if (tab === "archive") {
    knowledge = await fetchKnowledgeArchive();
    textBlogEnabled = await fetchTextBlogEnabled();
  }

  if (tab === "safety") {
    safetyRules = await fetchSafetyInstructions();
  }

  if (tab === "manual") {
    manualText = await fetchManualTrainingTemplate();
  }

  return (
    <TrainingClient
      key={tab}
      initialTab={tab}
      initialKnowledge={knowledge}
      initialSafetyRules={safetyRules}
      initialManualText={manualText}
      initialTextBlogEnabled={textBlogEnabled}
    />
  );
}
