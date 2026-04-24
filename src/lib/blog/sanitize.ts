import type { BlogApiPost } from "@/lib/blog/api-client";

const MAX_CONTENT_CHARS = 4000;
const MAX_TRANSCRIPT_CHARS_FOR_CAPTION = 3000;

const decodeEntities = (s: string): string =>
  s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) =>
      String.fromCharCode(parseInt(n, 16)),
    );

export const stripHtml = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const noScriptStyle = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const noTags = noScriptStyle.replace(/<[^>]+>/g, " ");
  const decoded = decodeEntities(noTags);
  return decoded.replace(/\s+/g, " ").trim();
};

export const cleanVtt = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === "WEBVTT" || line.startsWith("WEBVTT ")) continue;
    if (line.startsWith("NOTE ")) continue;
    if (/-->/.test(line) && /\d\d?:\d\d/.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    const cleaned = line.replace(/<[^>]+>/g, "").trim();
    if (!cleaned) continue;
    out.push(cleaned);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
};

const clip = (text: string, max: number): string => {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
};

const joinParts = (parts: Array<string | null | undefined>): string =>
  parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(". ")
    .replace(/\.{2,}/g, ".");

export const buildPostContentText = (post: BlogApiPost): string => {
  const introduction = (post.introduction ?? "").trim();
  const descriptionClean = stripHtml(post.description ?? "");
  const transcript = cleanVtt(post.video_transcript ?? "");

  const body = transcript
    ? clip(transcript, MAX_TRANSCRIPT_CHARS_FOR_CAPTION)
    : clip(descriptionClean, MAX_CONTENT_CHARS);

  return clip(joinParts([introduction, body]), MAX_CONTENT_CHARS);
};
