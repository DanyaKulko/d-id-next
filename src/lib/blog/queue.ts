import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: null,
});

export type BlogJobName = "sync-delta" | "caption-images" | "caption-videos";

export interface SyncDeltaJobData {
  type?: number;
  maxPages?: number;
}

export interface CaptionImagesJobData {
  limit?: number;
}

export interface CaptionVideosJobData {
  limit?: number;
}

export const blogQueue = new Queue<
  SyncDeltaJobData | CaptionImagesJobData | CaptionVideosJobData,
  unknown,
  BlogJobName
>("blog-media-sync", {
  // biome-ignore lint/suspicious/noExplicitAny: IORedis typings mismatch with BullMQ accepted shape.
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { age: 24 * 3600, count: 200 },
    removeOnFail: { age: 7 * 24 * 3600, count: 500 },
  },
});
