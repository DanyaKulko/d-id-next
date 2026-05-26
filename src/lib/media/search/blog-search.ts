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

// Two-tier ranking: tier 1 = photo's own Vision caption matches; tier 2 =
// parent post text matches (photo inherits post rank). Capped per post for
// variety, then extra photos backfill remaining slots up to `limit`.
export const searchBlogPhotos = async (
  keywords: string,
  limit = 4,
): Promise<MediaItem[]> => {
  const query = buildOrQuery(keywords);
  if (!query) return [];

  try {
    const rows = await prisma.$queryRaw<PhotoRow[]>`
      WITH q AS (
        SELECT websearch_to_tsquery('english', ${query}) AS tsq
      ),
      candidates AS (
        SELECT
          bma.id             AS id,
          bma."postId"       AS post_id,
          bma.url            AS url,
          bma."thumbnailUrl" AS thumbnail_url,
          bma.title          AS title,
          bma."orderIndex"   AS order_index,
          1                  AS tier,
          ts_rank_cd(bma."searchVector", q.tsq) AS rank
        FROM blog_media_assets bma
        CROSS JOIN q
        WHERE bma.kind = 'PHOTO'
          AND bma."searchVector" @@ q.tsq

        UNION ALL

        SELECT
          bma.id             AS id,
          bma."postId"       AS post_id,
          bma.url            AS url,
          bma."thumbnailUrl" AS thumbnail_url,
          bma.title          AS title,
          bma."orderIndex"   AS order_index,
          2                  AS tier,
          ts_rank_cd(bp."searchVector", q.tsq) AS rank
        FROM blog_posts bp
        JOIN blog_media_assets bma ON bma."postId" = bp.id
        CROSS JOIN q
        WHERE bp."searchVector" @@ q.tsq
          AND bma.kind = 'PHOTO'
      ),
      deduped AS (
        SELECT DISTINCT ON (id)
          id, post_id, url, thumbnail_url, title, order_index, tier, rank
        FROM candidates
        ORDER BY id, tier ASC, rank DESC
      ),
      ranked AS (
        SELECT
          d.*,
          ROW_NUMBER() OVER (
            PARTITION BY post_id
            ORDER BY tier ASC, rank DESC, order_index ASC
          ) AS post_rn
        FROM deduped d
      )
      SELECT
        r.id,
        r.post_id,
        r.url,
        r.thumbnail_url,
        r.title,
        bp."regionName" AS region_name,
        bp.link         AS link
      FROM ranked r
      JOIN blog_posts bp ON bp.id = r.post_id
      WHERE r.rank >= ${MIN_RANK}
      ORDER BY
        (r.post_rn <= ${MAX_PHOTOS_PER_POST}) DESC,
        r.tier ASC,
        r.rank DESC,
        r.post_rn ASC
      LIMIT ${limit};
    `;
    return rows.map(toMediaItemPhoto);
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
    // Same two-tier rule as photos: tier 1 = the video's own caption
    // (transcript-derived) matches; tier 2 = the parent post text matches.
    const rows = await prisma.$queryRaw<VideoRow[]>`
      WITH q AS (
        SELECT websearch_to_tsquery('english', ${query}) AS tsq
      ),
      candidates AS (
        SELECT
          bma.id             AS id,
          bma."postId"       AS post_id,
          bma.url            AS url,
          bma."thumbnailUrl" AS thumbnail_url,
          bma."embedUrl"     AS embed_url,
          bma.title          AS title,
          bma."orderIndex"   AS order_index,
          1                  AS tier,
          ts_rank_cd(bma."searchVector", q.tsq) AS rank
        FROM blog_media_assets bma
        CROSS JOIN q
        WHERE bma.kind = 'VIDEO'
          AND bma."searchVector" @@ q.tsq

        UNION ALL

        SELECT
          bma.id             AS id,
          bma."postId"       AS post_id,
          bma.url            AS url,
          bma."thumbnailUrl" AS thumbnail_url,
          bma."embedUrl"     AS embed_url,
          bma.title          AS title,
          bma."orderIndex"   AS order_index,
          2                  AS tier,
          ts_rank_cd(bp."searchVector", q.tsq) AS rank
        FROM blog_posts bp
        JOIN blog_media_assets bma ON bma."postId" = bp.id
        CROSS JOIN q
        WHERE bp."searchVector" @@ q.tsq
          AND bma.kind = 'VIDEO'
      ),
      deduped AS (
        SELECT DISTINCT ON (id)
          id, post_id, url, thumbnail_url, embed_url, title, order_index, tier, rank
        FROM candidates
        ORDER BY id, tier ASC, rank DESC
      )
      SELECT
        d.id,
        d.post_id,
        d.url,
        d.thumbnail_url,
        d.embed_url,
        d.title,
        bp."regionName" AS region_name,
        bp.link         AS link
      FROM deduped d
      JOIN blog_posts bp ON bp.id = d.post_id
      WHERE d.rank >= ${MIN_RANK}
      ORDER BY d.tier ASC, d.rank DESC, d.order_index ASC
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
