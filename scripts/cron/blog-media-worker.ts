import { Worker } from "bullmq";
import IORedis from "ioredis";
import { BlogApiClient } from "@/lib/blog/api-client";
import {
  captionPost,
  ingestPage,
  listPendingCaptionIds,
} from "@/lib/blog/ingest";
import { prisma } from "@/lib/db/prisma";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const LAST_SYNC_KEY = "blog-media:lastRemoteUpdatedAt";
const DEFAULT_MAX_PAGES = 40;
const INITIAL_BACKFILL_MAX_PAGES = 1000;
const CAPTION_CONCURRENCY = 4;

const LOCK_DURATION_MS = 5 * 60 * 1000;
const LOCK_EXTEND_INTERVAL_MS = 2 * 60 * 1000;

type Level = "INFO" | "WARN" | "ERROR";
const log = (level: Level, message: string, meta?: Record<string, unknown>) => {
  const line = `[blog-media][${level}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`;
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
};

const client = new BlogApiClient({ log });

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const readLastSyncAt = async (): Promise<Date | null> => {
  const row = await prisma.blogIngestState.findUnique({
    where: { key: LAST_SYNC_KEY },
  });
  if (!row) return null;
  const d = new Date(row.value);
  return Number.isFinite(d.getTime()) ? d : null;
};

const writeLastSyncAt = async (value: Date): Promise<void> => {
  await prisma.blogIngestState.upsert({
    where: { key: LAST_SYNC_KEY },
    create: { key: LAST_SYNC_KEY, value: value.toISOString() },
    update: { value: value.toISOString() },
  });
};

async function runSync(opts: {
  stopAt: Date | null;
  type?: number;
  maxPages: number;
}): Promise<{ pagesProcessed: number; inserted: number; updated: number }> {
  let pagesProcessed = 0;
  let inserted = 0;
  let updated = 0;
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage && pagesProcessed < opts.maxPages) {
    const result = await ingestPage(client, page, {
      stopAt: opts.stopAt,
      type: opts.type,
    });
    pagesProcessed++;
    inserted += result.inserted;
    updated += result.updated;
    lastPage = result.lastPage;

    log("INFO", "Page processed", {
      page: result.page,
      lastPage: result.lastPage,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      stopAt: opts.stopAt?.toISOString(),
    });

    if (opts.stopAt && result.reachedStopAt) {
      log("INFO", "Reached stopAt — halting delta sync");
      break;
    }
    page++;
  }

  return { pagesProcessed, inserted, updated };
}

async function captionBatch(limit: number): Promise<{
  processed: number;
  ready: number;
  failed: number;
  unexpected: number;
}> {
  const ids = await listPendingCaptionIds(limit);
  if (ids.length === 0)
    return { processed: 0, ready: 0, failed: 0, unexpected: 0 };

  let ready = 0;
  let failed = 0;
  let unexpected = 0;
  let cursor = 0;

  const runSlot = async (): Promise<void> => {
    while (cursor < ids.length) {
      const myIndex = cursor++;
      const id = ids[myIndex];
      try {
        const res = await captionPost(id);
        if (res.status === "READY") ready++;
        else if (res.status === "FAILED") failed++;
      } catch (error) {
        unexpected++;
        log("ERROR", "captionPost threw unexpectedly", {
          id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  await Promise.allSettled(
    Array.from({ length: Math.min(CAPTION_CONCURRENCY, ids.length) }, runSlot),
  );

  return { processed: ids.length, ready, failed, unexpected };
}

const MAX_CAPTION_LOOPS = 50;
const CAPTION_LOOP_BATCH = 200;

async function drainCaptions(): Promise<{
  processed: number;
  ready: number;
  failed: number;
  unexpected: number;
  loops: number;
}> {
  const totals = { processed: 0, ready: 0, failed: 0, unexpected: 0, loops: 0 };
  for (let i = 0; i < MAX_CAPTION_LOOPS; i++) {
    const cap = await captionBatch(CAPTION_LOOP_BATCH);
    totals.processed += cap.processed;
    totals.ready += cap.ready;
    totals.failed += cap.failed;
    totals.unexpected += cap.unexpected;
    totals.loops += 1;
    if (cap.processed === 0) break;
    if (cap.ready === 0 && cap.failed === cap.processed) break;
  }
  return totals;
}

const worker = new Worker(
  "blog-media-sync",
  async (job) => {
    const name = job.name as "sync-delta";
    const startedAt = Date.now();
    log("INFO", "Job started", { id: job.id, name, data: job.data });

    const keepAlive = setInterval(() => {
      job.extendLock(job.token ?? "", LOCK_DURATION_MS).catch((err) =>
        log("WARN", "extendLock failed", {
          id: job.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }, LOCK_EXTEND_INTERVAL_MS);

    try {
      if (name !== "sync-delta") {
        throw new Error(`Unknown job name: ${name}`);
      }

      const prev = await readLastSyncAt();
      const isInitialBackfill = prev === null;
      const runStartedAt = new Date();

      const maxPages =
        (job.data as { maxPages?: number })?.maxPages ??
        (isInitialBackfill ? INITIAL_BACKFILL_MAX_PAGES : DEFAULT_MAX_PAGES);

      const result = await runSync({
        stopAt: prev,
        type: (job.data as { type?: number })?.type,
        maxPages,
      });
      await writeLastSyncAt(runStartedAt);

      const caption = await drainCaptions();

      log("INFO", "Sync + caption done", {
        ...result,
        isInitialBackfill,
        caption,
        elapsedMs: Date.now() - startedAt,
      });
      return { ...result, isInitialBackfill, caption };
    } catch (error) {
      log("ERROR", "Job failed", {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      clearInterval(keepAlive);
    }
  },
  {
    // biome-ignore lint/suspicious/noExplicitAny: IORedis typings mismatch with BullMQ accepted shape.
    connection: connection as any,
    concurrency: 1,
    lockDuration: LOCK_DURATION_MS,
  },
);

worker.on("ready", () => log("INFO", "Blog media worker ready"));
worker.on("error", (err) =>
  log("ERROR", "Worker error", { error: err.message }),
);

process.on("SIGTERM", async () => {
  log("INFO", "SIGTERM received, closing worker");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});
