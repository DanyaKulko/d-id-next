import { prisma } from "@/lib/db/prisma";
import { logExternalServiceError } from "@/lib/logging/external-errors";
import type { MediaItem } from "@/lib/media/types";

const MIN_RANK = 0.0001;

const NOISE_WORDS = new Set([
  "photo",
  "photos",
  "video",
  "videos",
  "blog",
  "trip",
  "travel",
  "show",
  "image",
  "images",
  "pic",
  "pics",
  "picture",
  "pictures",
]);

const buildOrQuery = (keywords: string): string | null => {
  const tokens = keywords
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .filter((t) => !NOISE_WORDS.has(t));
  if (tokens.length === 0) return null;
  const unique = Array.from(new Set(tokens));
  return unique.join(" OR ");
};

type PhotoRow = {
  id: string;
  post_id: number;
  url: string;
  thumbnail_url: string | null;
  title: string | null;
  region_name: string | null;
  link: string | null;
};

type VideoRow = PhotoRow & {
  embed_url: string | null;
};

const toMediaItemPhoto = (row: PhotoRow): MediaItem => ({
  id: row.id,
  kind: "photo",
  url: row.url,
  thumbnailUrl: row.thumbnail_url ?? row.url,
  title: row.title ?? "Photo",
  source: row.region_name ?? "Neil's travels",
  link: row.link ?? row.url,
});

const toMediaItemVideo = (row: VideoRow): MediaItem => ({
  id: row.id,
  kind: "video",
  url: row.link ?? row.url,
  thumbnailUrl: row.thumbnail_url ?? "",
  title: row.title ?? "Video",
  source: row.region_name ?? "Neil's travels",
  link: row.link ?? row.url,
  embedUrl: row.embed_url ?? undefined,
});

const MAX_PHOTOS_PER_POST = 2;

export const searchBlogPhotos = async (
  keywords: string,
  limit = 4,
): Promise<MediaItem[]> => {
  const query = buildOrQuery(keywords);
  if (!query) return [];

  try {
    const capped = await prisma.$queryRaw<PhotoRow[]>`
      WITH matched_posts AS (
        SELECT
          bp.id,
          bp."regionName" AS region_name,
          bp.link AS link,
          ts_rank_cd(bp."searchVector", websearch_to_tsquery('english', ${query})) AS rank
        FROM blog_posts bp
        WHERE bp."searchVector" @@ websearch_to_tsquery('english', ${query})
        ORDER BY rank DESC
        LIMIT 8
      ),
      ranked_assets AS (
        SELECT
          bma.id AS id,
          bma."postId" AS post_id,
          bma.url AS url,
          bma."thumbnailUrl" AS thumbnail_url,
          bma.title AS title,
          mp.region_name AS region_name,
          mp.link AS link,
          mp.rank AS rank,
          ROW_NUMBER() OVER (
            PARTITION BY bma."postId"
            ORDER BY bma."orderIndex" ASC
          ) AS asset_rn
        FROM matched_posts mp
        JOIN blog_media_assets bma ON bma."postId" = mp.id
        WHERE bma.kind = 'PHOTO' AND mp.rank >= ${MIN_RANK}
      )
      SELECT id, post_id, url, thumbnail_url, title, region_name, link
      FROM ranked_assets
      WHERE asset_rn <= ${MAX_PHOTOS_PER_POST}
      ORDER BY rank DESC, asset_rn ASC
      LIMIT ${limit};
    `;

    if (capped.length >= limit) return capped.map(toMediaItemPhoto);
    if (capped.length === 0) return [];

    const takenIds = capped.map((r) => r.id);
    const remaining = limit - capped.length;
    const filler = await prisma.$queryRaw<PhotoRow[]>`
      WITH matched_posts AS (
        SELECT
          bp.id,
          bp."regionName" AS region_name,
          bp.link AS link,
          ts_rank_cd(bp."searchVector", websearch_to_tsquery('english', ${query})) AS rank
        FROM blog_posts bp
        WHERE bp."searchVector" @@ websearch_to_tsquery('english', ${query})
        ORDER BY rank DESC
        LIMIT 4
      )
      SELECT
        bma.id AS id,
        bma."postId" AS post_id,
        bma.url AS url,
        bma."thumbnailUrl" AS thumbnail_url,
        bma.title AS title,
        mp.region_name AS region_name,
        mp.link AS link
      FROM matched_posts mp
      JOIN blog_media_assets bma ON bma."postId" = mp.id
      WHERE bma.kind = 'PHOTO'
        AND mp.rank >= ${MIN_RANK}
        AND NOT (bma.id = ANY(${takenIds}::text[]))
      ORDER BY mp.rank DESC, bma."orderIndex" ASC
      LIMIT ${remaining};
    `;
    return [...capped, ...filler].map(toMediaItemPhoto);
  } catch (error) {
    await logExternalServiceError({
      source: "BlogSearch",
      type: "searchBlogPhotos",
      message: error instanceof Error ? error.message : String(error),
      metadata: { query: keywords.slice(0, 200) },
    });
    return [];
  }
};

export const searchBlogVideos = async (
  keywords: string,
  limit = 1,
): Promise<MediaItem[]> => {
  const query = buildOrQuery(keywords);
  if (!query) return [];

  try {
    const rows = await prisma.$queryRaw<VideoRow[]>`
      WITH matched_posts AS (
        SELECT
          bp.id,
          bp."regionName"   AS region_name,
          bp.link           AS link,
          ts_rank_cd(bp."searchVector", websearch_to_tsquery('english', ${query})) AS rank
        FROM blog_posts bp
        WHERE bp."searchVector" @@ websearch_to_tsquery('english', ${query})
          AND bp.type = 'VIDEO'
        ORDER BY rank DESC
        LIMIT 4
      )
      SELECT
        bma.id             AS id,
        bma."postId"       AS post_id,
        bma.url            AS url,
        bma."thumbnailUrl" AS thumbnail_url,
        bma."embedUrl"     AS embed_url,
        bma.title          AS title,
        mp.region_name     AS region_name,
        mp.link            AS link
      FROM matched_posts mp
      JOIN blog_media_assets bma ON bma."postId" = mp.id
      WHERE bma.kind = 'VIDEO'
        AND mp.rank >= ${MIN_RANK}
      ORDER BY mp.rank DESC, bma."orderIndex" ASC
      LIMIT ${limit};
    `;
    return rows.map(toMediaItemVideo);
  } catch (error) {
    await logExternalServiceError({
      source: "BlogSearch",
      type: "searchBlogVideos",
      message: error instanceof Error ? error.message : String(error),
      metadata: { query: keywords.slice(0, 200) },
    });
    return [];
  }
};
