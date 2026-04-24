import { NextResponse } from "next/server";
import { z } from "zod";
import { blogQueue } from "@/lib/blog/queue";

const bodySchema = z
  .object({
    type: z.number().int().min(1).max(6).optional(),
    maxPages: z.number().int().positive().max(2000).optional(),
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

  const job = await blogQueue.add("sync-delta", {
    type: parsed.data.type,
    maxPages: parsed.data.maxPages,
  });
  return NextResponse.json({ status: "scheduled", jobId: job.id });
}
