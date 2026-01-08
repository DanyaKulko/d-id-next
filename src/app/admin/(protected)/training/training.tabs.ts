export const trainingTabs = ["archive", "safety", "manual"] as const;

export type TrainingTabId = (typeof trainingTabs)[number];

export const trainingTabTitles: Record<TrainingTabId, string> = {
  archive: "Knowledge Archive",
  safety: "Safety",
  manual: "Manual Training",
};
