import { redirect } from "next/navigation";
import {
  fetchTrainingRoles,
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
  searchParams: Promise<{ role?: string }>;
};

export default async function TrainingTabPage({
  params,
  searchParams,
}: TrainingTabPageProps) {
  const { tab: rawTab } = await params;
  const { role: rawRole } = await searchParams;
  const tab = rawTab as TrainingTabId;
  if (!trainingTabs.includes(tab)) {
    redirect("/admin/training/archive");
  }

  const roles = await fetchTrainingRoles();
  if (roles.length === 0) {
    redirect("/admin/roles");
  }

  const fallbackRole = roles[0]?.key ?? "";
  const roleKey =
    rawRole && roles.some((role) => role.key === rawRole) ? rawRole : fallbackRole;
  if (!roleKey) {
    redirect("/admin/roles");
  }
  if (rawRole !== roleKey) {
    redirect(`/admin/training/${tab}?role=${encodeURIComponent(roleKey)}`);
  }

  let knowledge: KnowledgeItem[] = [];
  let safetyRules = "";
  let manualText = "";
  let textBlogEnabled = true;

  if (tab === "archive") {
    knowledge = await fetchKnowledgeArchive(roleKey);
    textBlogEnabled = await fetchTextBlogEnabled(roleKey);
  }

  if (tab === "safety") {
    safetyRules = await fetchSafetyInstructions(roleKey);
  }

  if (tab === "manual") {
    manualText = await fetchManualTrainingTemplate(roleKey);
  }

  return (
    <TrainingClient
      key={`${tab}-${roleKey}`}
      initialTab={tab}
      roleKey={roleKey}
      initialKnowledge={knowledge}
      initialSafetyRules={safetyRules}
      initialManualText={manualText}
      initialTextBlogEnabled={textBlogEnabled}
    />
  );
}
