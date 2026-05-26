import { generateVideoCaption } from "@/lib/blog/caption";
import { prisma } from "@/lib/db/prisma";

// Any VIDEO asset without a caption yet. The caption is derived once from the
// post transcript (already folded into contentText at ingest) plus context.
const VIDEO_CAPTION_FILTER = {
  kind: "VIDEO" as const,
  imageCaption: null,
};

export const countPendingVideoAssets = (): Promise<number> =>
  prisma.blogMediaAsset.count({ where: VIDEO_CAPTION_FILTER });

const listPendingVideoAssetIds = async (limit: number): Promise<string[]> => {
  const rows = await prisma.blogMediaAsset.findMany({
    where: VIDEO_CAPTION_FILTER,
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
};

export type VideoCaptionStatus = "DONE" | "SKIPPED" | "FAILED";

export const captionOneVideoAsset = async (
  assetId: string,
): Promise<VideoCaptionStatus> => {
  const asset = await prisma.blogMediaAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      imageCaption: true,
      post: {
        select: {
          title: true,
          regionName: true,
          continentName: true,
          language: true,
          contentText: true,
          captionText: true,
          publishedAt: true,
        },
      },
    },
  });
  if (!asset || asset.imageCaption) return "SKIPPED";

  const content = asset.post?.contentText ?? "";
  const title = asset.post?.title ?? "";
  // No transcript/article and no title to caption from — leave null for retry.
  if (!content && !title) return "SKIPPED";

  try {
    const { caption, model } = await generateVideoCaption({
      title,
      regionName: asset.post?.regionName ?? "",
      continentName: asset.post?.continentName ?? "",
      language: asset.post?.language ?? "",
      content,
      postCaption: asset.post?.captionText ?? "",
      publishedAt: asset.post?.publishedAt
        ? asset.post.publishedAt.toISOString().slice(0, 10)
        : null,
    });
    await prisma.blogMediaAsset.update({
      where: { id: assetId },
      data: { imageCaption: caption, imageCaptionModel: model },
    });
    return "DONE";
  } catch {
    // Leave imageCaption null so the asset is retried on the next run.
    return "FAILED";
  }
};

const CONCURRENCY = 4;

export interface VideoCaptionBatchResult {
  processed: number;
  done: number;
  failed: number;
}

export const captionVideoBatch = async (
  limit: number,
): Promise<VideoCaptionBatchResult> => {
  const ids = await listPendingVideoAssetIds(limit);
  if (ids.length === 0) return { processed: 0, done: 0, failed: 0 };

  let done = 0;
  let failed = 0;
  let cursor = 0;

  const runSlot = async (): Promise<void> => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const status = await captionOneVideoAsset(id);
      if (status === "DONE") done++;
      else if (status === "FAILED") failed++;
    }
  };

  await Promise.allSettled(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, runSlot),
  );

  return { processed: ids.length, done, failed };
};
