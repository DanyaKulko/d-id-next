import { NextResponse } from "next/server";
import { z } from "zod";
import { blogQueue } from "@/lib/blog/queue";

const bodySchema = z
  .object({
    // mode "sync" (default) pulls posts; "caption-images" runs Vision
    // captioning; "caption-videos" captions videos from transcript + context
    mode: z.enum(["sync", "caption-images", "caption-videos"]).optional(),
    type: z.number().int().min(1).max(6).optional(),
    maxPages: z.number().int().positive().max(2000).optional(),
    // caption-*: cap on how many assets to process this run (default: all)
    limit: z.number().int().positive().max(100000).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {}

  const parsed = bodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.mode === "caption-images") {
    const job = await blogQueue.add("caption-images", {
      limit: parsed.data.limit,
    });
    return NextResponse.json({
      status: "scheduled",
      mode: "caption-images",
      jobId: job.id,
    });
  }

  if (parsed.data.mode === "caption-videos") {
    const job = await blogQueue.add("caption-videos", {
      limit: parsed.data.limit,
    });
    return NextResponse.json({
      status: "scheduled",
      mode: "caption-videos",
      jobId: job.id,
    });
  }

  const job = await blogQueue.add("sync-delta", {
    type: parsed.data.type,
    maxPages: parsed.data.maxPages,
  });
  return NextResponse.json({ status: "scheduled", jobId: job.id });
}
