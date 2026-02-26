export const trainingSourceLabels = {
  manual: "Manual training",
  textBlog: "Text blog",
  videoTranscripts: "Video transcripts",
} as const;

export const trainingDocumentTitles = {
  manualKnowledge: "Fundamental brief + manual training",
} as const;

export const trainingLimits = {
  minRawPostChars: 500,
  targetSummarizedPostChars: 2500,
  maxSummarizedPostChars: 3000,
  knowledgeBucketCharLimit: 470000,
  maxBlogKnowledgeDocuments: 4,
  manualTrainingCharLimit: 350000,
  fundamentalBriefReserveChars: 200000,
} as const;

export type BlogCategoryDescriptor = {
  key: "touristy" | "sports" | "politics" | "space";
  title: string;
  categoryId: number;
};

export const defaultBlogCategoryCatalog: BlogCategoryDescriptor[] = [
  { key: "touristy", title: "Touristy", categoryId: 2 },
  { key: "sports", title: "Sports", categoryId: 4 },
  { key: "politics", title: "Politics", categoryId: 1 },
  { key: "space", title: "Space", categoryId: 5 },
];

export const normalizeTrainingCategoryIds = (value: number[]) => {
  const normalized = value
    .map((item) => Math.trunc(item))
    .filter((item) => Number.isFinite(item) && item > 0);
  return Array.from(new Set(normalized));
};

export const resolveBlogCategoryById = (categoryId: number) =>
  defaultBlogCategoryCatalog.find((item) => item.categoryId === categoryId);

export const resolveBlogCategoryTitle = (categoryId: number) =>
  categoryId > 0
    ? (resolveBlogCategoryById(categoryId)?.title ?? `Category ${categoryId}`)
    : "";
