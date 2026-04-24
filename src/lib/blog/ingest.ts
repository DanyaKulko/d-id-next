import type {
  BlogApiClient,
  BlogApiMediaItem,
  BlogApiPost,
} from "@/lib/blog/api-client";
import { generatePostCaption } from "@/lib/blog/caption";
import { buildPostContentText } from "@/lib/blog/sanitize";
import { prisma } from "@/lib/db/prisma";

type LocalPostType =
  | "ALBUM"
  | "POSTCARD"
  | "TRAVEL_TIP"
  | "GLOBAL_TIP"
  | "BLOG"
  | "VIDEO"
  | "OTHER";

const POST_TYPE_MAP: Record<number, LocalPostType> = {
  1: "ALBUM",
  2: "POSTCARD",
  3: "TRAVEL_TIP",
  4: "GLOBAL_TIP",
  5: "BLOG",
  6: "VIDEO",
};

const mapPostType = (type: number): LocalPostType =>
  POST_TYPE_MAP[type] ?? "OTHER";

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
};

const pickVideoEmbedUrl = (post: BlogApiPost): string | null => {
  const rawIframe = post.video?.assets?.iframe;
  if (rawIframe) {
    const match = rawIframe.match(/src="([^"]+)"/i);
    if (match) return match[1];
  }
  if (post.video?.videoId) {
    return `https://embed.api.video/vod/${post.video.videoId}`;
  }
  return null;
};

const pickVideoThumbnail = (post: BlogApiPost): string | null => {
  if (post.video?.assets?.thumbnail) return post.video.assets.thumbnail;
  if (post.video?.videoId) {
    return `https://cdn.api.video/vod/${post.video.videoId}/thumbnail.jpg`;
  }
  return post.smart_image ?? null;
};

interface MediaRecordInput {
  postId: number;
  sourceId: string;
  kind: "PHOTO" | "VIDEO";
  url: string;
  thumbnailUrl: string | null;
  embedUrl: string | null;
  mimeType: string | null;
  title: string | null;
  orderIndex: number;
}

const extractPhotoAssets = (post: BlogApiPost): MediaRecordInput[] => {
  const items = Array.isArray(post.media) ? post.media : [];
  const photos = items.filter((m: BlogApiMediaItem) => {
    const collection = (m.collection_name ?? "").toLowerCase();
    const mime = (m.mime_type ?? "").toLowerCase();
    const isImageCollection = collection === "cover" || collection === "image";
    const isImageMime = mime.startsWith("image/");
    return isImageCollection && isImageMime && Boolean(m.original_url);
  });

  photos.sort((a, b) => {
    const coverDelta =
      (a.collection_name === "cover" ? 0 : 1) -
      (b.collection_name === "cover" ? 0 : 1);
    if (coverDelta !== 0) return coverDelta;
    const oa = a.order_column ?? 0;
    const ob = b.order_column ?? 0;
    if (oa !== ob) return oa - ob;
    return String(a.id).localeCompare(String(b.id));
  });

  return photos.map((m, idx) => ({
    postId: post.id,
    sourceId: `media:${m.id}`,
    kind: "PHOTO" as const,
    url: m.original_url!,
    thumbnailUrl: m.preview_url ? m.preview_url : (m.original_url ?? null),
    embedUrl: null,
    mimeType: m.mime_type ?? null,
    title: (m.name ?? m.file_name ?? post.title ?? "").trim() || null,
    orderIndex: idx,
  }));
};

const extractVideoAsset = (post: BlogApiPost): MediaRecordInput | null => {
  if (!post.video || !post.video.videoId) return null;
  const embedUrl = pickVideoEmbedUrl(post);
  if (!embedUrl) return null;
  return {
    postId: post.id,
    sourceId: `video:${post.video.videoId}`,
    kind: "VIDEO",
    url: post.link ?? embedUrl,
    thumbnailUrl: pickVideoThumbnail(post),
    embedUrl,
    mimeType: "video/mp4",
    title: (post.video.title ?? post.title ?? "").trim() || null,
    orderIndex: 0,
  };
};

export interface IngestPageOptions {
  stopAt?: Date | null;
  type?: number;
}

export interface IngestPageResult {
  page: number;
  lastPage: number;
  totalRemote: number;
  postsInPage: number;
  inserted: number;
  updated: number;
  skipped: number;
  reachedStopAt: boolean;
}

const isPostActive = (post: BlogApiPost): boolean =>
  post.status === undefined || post.status === true;

export async function ingestPage(
  client: BlogApiClient,
  page: number,
  options: IngestPageOptions = {},
): Promise<IngestPageResult> {
  const params: Record<string, unknown> = {
    page,
    limit: 50,
    sort: "date",
    direction: "desc",
    status: 1,
  };
  if (options.type != null) params.type = options.type;

  const resp = await client.getPosts(params);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let reachedStopAt = false;

  for (const post of resp.data) {
    if (!isPostActive(post)) {
      skipped++;
      continue;
    }
    const remoteUpdatedAt =
      parseDate(post.updated_at) ?? parseDate(post.published_at);
    if (options.stopAt && remoteUpdatedAt && remoteUpdatedAt < options.stopAt) {
      reachedStopAt = true;
      break;
    }

    const outcome = await upsertPost(post);
    if (outcome === "inserted") inserted++;
    else if (outcome === "updated") updated++;
    else skipped++;
  }

  return {
    page: resp.current_page,
    lastPage: resp.last_page,
    totalRemote: resp.total,
    postsInPage: resp.data.length,
    inserted,
    updated,
    skipped,
    reachedStopAt,
  };
}

async function upsertPost(
  post: BlogApiPost,
): Promise<"inserted" | "updated" | "skipped"> {
  const contentText = buildPostContentText(post);
  if (!contentText) return "skipped";

  const photos = extractPhotoAssets(post);
  const video = extractVideoAsset(post);

  if (photos.length === 0 && !video) return "skipped";

  const typeKey = mapPostType(post.type);

  const remoteUpdatedAt =
    parseDate(post.updated_at) ?? parseDate(post.published_at);
  const publishedAt = parseDate(post.published_at);

  const existing = await prisma.blogPost.findUnique({
    where: { id: post.id },
    select: {
      id: true,
      remoteUpdatedAt: true,
      contentText: true,
      captionStatus: true,
    },
  });

  const contentChanged = !existing || existing.contentText !== contentText;

  const allAssets = video ? [...photos, video] : photos;

  await prisma.$transaction(
    async (tx) => {
      await tx.blogPost.upsert({
        where: { id: post.id },
        create: {
          id: post.id,
          type: typeKey,
          title: post.title ?? "(untitled)",
          link: post.link ?? null,
          regionName: post.region?.name ?? null,
          continentName: post.region?.continent?.name ?? null,
          contentText,
          captionStatus: "PENDING",
          language: post.video?.language ?? null,
          publishedAt,
          remoteUpdatedAt,
        },
        update: {
          type: typeKey,
          title: post.title ?? "(untitled)",
          link: post.link ?? null,
          regionName: post.region?.name ?? null,
          continentName: post.region?.continent?.name ?? null,
          contentText,
          ...(contentChanged
            ? {
                captionText: null,
                captionStatus: "PENDING" as const,
                captionError: null,
                captionModel: null,
                captionedAt: null,
              }
            : {}),
          language: post.video?.language ?? null,
          publishedAt,
          remoteUpdatedAt,
        },
      });

      for (const asset of allAssets) {
        await tx.blogMediaAsset.upsert({
          where: {
            postId_sourceId: { postId: asset.postId, sourceId: asset.sourceId },
          },
          create: {
            postId: asset.postId,
            kind: asset.kind,
            url: asset.url,
            thumbnailUrl: asset.thumbnailUrl,
            embedUrl: asset.embedUrl,
            mimeType: asset.mimeType,
            title: asset.title,
            orderIndex: asset.orderIndex,
            sourceId: asset.sourceId,
          },
          update: {
            kind: asset.kind,
            url: asset.url,
            thumbnailUrl: asset.thumbnailUrl,
            embedUrl: asset.embedUrl,
            mimeType: asset.mimeType,
            title: asset.title,
            orderIndex: asset.orderIndex,
          },
        });
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  return existing ? "updated" : "inserted";
}

export interface CaptionPostOptions {
  force?: boolean;
}

export interface CaptionPostResult {
  id: number;
  status: "READY" | "FAILED" | "SKIPPED";
  model?: string;
  error?: string;
}

export async function captionPost(
  postId: number,
  options: CaptionPostOptions = {},
): Promise<CaptionPostResult> {
  const row = await prisma.blogPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      regionName: true,
      continentName: true,
      contentText: true,
      captionStatus: true,
      type: true,
    },
  });
  if (!row) return { id: postId, status: "SKIPPED", error: "not found" };
  if (!options.force && row.captionStatus === "READY") {
    return { id: postId, status: "SKIPPED" };
  }

  const kind: "PHOTO" | "VIDEO" = row.type === "VIDEO" ? "VIDEO" : "PHOTO";

  try {
    const { captionText, model } = await generatePostCaption({
      kind,
      title: row.title,
      regionName: row.regionName ?? "",
      continentName: row.continentName ?? "",
      body: row.contentText,
    });

    await prisma.blogPost.update({
      where: { id: postId },
      data: {
        captionText,
        captionStatus: "READY",
        captionModel: model,
        captionedAt: new Date(),
        captionError: null,
      },
    });
    return { id: postId, status: "READY", model };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.blogPost.update({
      where: { id: postId },
      data: {
        captionStatus: "FAILED",
        captionError: message.slice(0, 1000),
      },
    });
    return { id: postId, status: "FAILED", error: message };
  }
}

export async function listPendingCaptionIds(limit = 50): Promise<number[]> {
  const rows = await prisma.blogPost.findMany({
    where: {
      OR: [{ captionStatus: "PENDING" }, { captionStatus: "FAILED" }],
    },
    orderBy: [{ remoteUpdatedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
