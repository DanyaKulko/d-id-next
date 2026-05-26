import { generateImageCaption } from "@/lib/blog/caption";
import { prisma } from "@/lib/db/prisma";

// Selection criteria for Vision captioning:
//   - the asset is a PHOTO that has no imageCaption yet
//   - its file title contains "resized" (the downscaled gallery images)
//   - the parent post is an ALBUM
const IMAGE_CAPTION_FILTER = {
  kind: "PHOTO" as const,
  imageCaption: null,
  title: { contains: "resized", mode: "insensitive" as const },
  post: { is: { type: "ALBUM" as const } },
};

export const countPendingImageAssets = (): Promise<number> =>
  prisma.blogMediaAsset.count({ where: IMAGE_CAPTION_FILTER });

const listPendingImageAssetIds = async (limit: number): Promise<string[]> => {
  const rows = await prisma.blogMediaAsset.findMany({
    where: IMAGE_CAPTION_FILTER,
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
};

export type ImageCaptionStatus = "DONE" | "SKIPPED" | "FAILED";

export const captionOneAsset = async (
  assetId: string,
): Promise<ImageCaptionStatus> => {
  const asset = await prisma.blogMediaAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      url: true,
      imageCaption: true,
      post: {
        select: {
          title: true,
          regionName: true,
          continentName: true,
          language: true,
          captionText: true,
          publishedAt: true,
        },
      },
    },
  });
  if (!asset || asset.imageCaption) return "SKIPPED";
  if (!asset.url) return "SKIPPED";

  try {
    const { caption, model } = await generateImageCaption({
      imageUrl: asset.url,
      postTitle: asset.post?.title ?? "",
      regionName: asset.post?.regionName ?? "",
      continentName: asset.post?.continentName ?? "",
      language: asset.post?.language ?? "",
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

export interface ImageCaptionBatchResult {
  processed: number;
  done: number;
  failed: number;
}

export const captionImageBatch = async (
  limit: number,
): Promise<ImageCaptionBatchResult> => {
  const ids = await listPendingImageAssetIds(limit);
  if (ids.length === 0) return { processed: 0, done: 0, failed: 0 };

  let done = 0;
  let failed = 0;
  let cursor = 0;

  const runSlot = async (): Promise<void> => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const status = await captionOneAsset(id);
      if (status === "DONE") done++;
      else if (status === "FAILED") failed++;
    }
  };

  await Promise.allSettled(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, runSlot),
  );

  return { processed: ids.length, done, failed };
};
