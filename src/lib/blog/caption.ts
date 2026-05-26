import { logExternalServiceError } from "@/lib/logging/external-errors";
import { openai } from "@/lib/media/openai";

// Models are env-overridable so they can be A/B-tested without a code change.
// IMPORTANT: the image captioner needs a VISION-capable model.
export const POST_CAPTION_MODEL =
  process.env.BLOG_POST_CAPTION_MODEL || "gpt-4o-mini";
export const IMAGE_CAPTION_MODEL =
  process.env.BLOG_IMAGE_CAPTION_MODEL || "gpt-4o";

// gpt-5 / o-series reject `max_tokens` (require `max_completion_tokens`) and a
// custom `temperature`, but accept `reasoning_effort`. gpt-4o* use the classic
// params. This keeps both paths valid since the model is env-swappable.
const isReasoningModel = (model: string): boolean =>
  /^(gpt-5|o[0-9])/i.test(model);

const modelTuning = (model: string, maxOutputTokens: number) =>
  isReasoningModel(model)
    ? {
        max_completion_tokens: maxOutputTokens,
        reasoning_effort: "minimal" as const,
      }
    : { max_completion_tokens: maxOutputTokens, temperature: 0.2 };

const POST_CAPTION_SYSTEM = `You are a caption writer preparing an English search index for Neil's travel blog.

Rules:
- Output a SINGLE short paragraph in English (40-80 words, 300-500 characters).
- Describe WHAT this post is about — places, events, people, themes — so keyword search can match it.
- Include proper nouns (city, country, landmark, person names) verbatim — they are the strongest search signals.
- Use plain declarative sentences. No first person, no greetings, no emojis, no markdown.
- Do NOT invent facts. If the input is sparse, keep the caption short.
- Output ONLY the caption, no preface, no quotes.`;

export interface GeneratePostCaptionInput {
  kind: "PHOTO" | "VIDEO";
  title: string;
  regionName: string;
  continentName: string;
  body: string;
}

export interface GeneratePostCaptionResult {
  captionText: string;
  model: string;
}

const buildUserPrompt = (input: GeneratePostCaptionInput): string => {
  const lines: string[] = [
    `Kind: ${input.kind === "VIDEO" ? "video post" : "photo post (album / article)"}`,
    `Title: ${input.title || "(untitled)"}`,
  ];
  if (input.regionName) lines.push(`Region: ${input.regionName}`);
  if (input.continentName) lines.push(`Continent: ${input.continentName}`);
  if (input.body) lines.push("", "Post content:", input.body);
  lines.push("", "Write the search-index caption now.");
  return lines.join("\n");
};

export const generatePostCaption = async (
  input: GeneratePostCaptionInput,
): Promise<GeneratePostCaptionResult> => {
  try {
    const completion = await openai.chat.completions.create(
      {
        model: POST_CAPTION_MODEL,
        ...modelTuning(POST_CAPTION_MODEL, 600),
        messages: [
          { role: "system", content: POST_CAPTION_SYSTEM },
          { role: "user", content: buildUserPrompt(input) },
        ],
      },
      { timeout: 20_000 },
    );
    const captionText = (completion.choices[0]?.message?.content ?? "").trim();
    if (!captionText) {
      throw new Error("Empty caption from model");
    }
    return { captionText, model: POST_CAPTION_MODEL };
  } catch (error) {
    await logExternalServiceError({
      source: "OpenAI",
      type: "Blog Post Caption",
      message: error instanceof Error ? error.message : String(error),
      metadata: { model: POST_CAPTION_MODEL, kind: input.kind },
    });
    throw error;
  }
};

// --- Per-image Vision caption ---------------------------------------------

// "auto" lets the model pick resolution; it upgrades to high-detail tiling
// when needed to read signs / labels / inscriptions (the prompt requires it).
const IMAGE_CAPTION_DETAIL: "low" | "high" | "auto" = "auto";

const IMAGE_CAPTION_SYSTEM = `You'll be given a travel blog photo along with its associated text: post title, region, continent, language, caption and publish date. Examine both the image and the provided context to understand what is shown in the photo and how it relates to the travel post. Provide a concise description, 2–20 words long, that captures the main subject, activity, place, person, object, event or visible meaning of the photo. Use the context only to clarify what is shown, such as location, event, post topic or relevant background. Do not invent details that are not supported by the image or context. If the photo includes visible text, such as a sign, slogan, label, headline, caption, monument text, street name or any other readable inscription, include the most important part of that text in the description.

Respond with ONLY the description text — no quotes, no preface, no trailing punctuation beyond what is natural.`;

export interface GenerateImageCaptionInput {
  imageUrl: string;
  postTitle: string;
  regionName: string;
  continentName: string;
  language: string;
  postCaption: string;
  publishedAt: string | null;
}

export interface GenerateImageCaptionResult {
  caption: string;
  model: string;
}

const buildImageContext = (input: GenerateImageCaptionInput): string => {
  const lines: string[] = [];
  if (input.postTitle) lines.push(`Post title: ${input.postTitle}`);
  if (input.regionName) lines.push(`Region: ${input.regionName}`);
  if (input.continentName) lines.push(`Continent: ${input.continentName}`);
  if (input.language) lines.push(`Language: ${input.language}`);
  if (input.postCaption) lines.push(`Caption: ${input.postCaption}`);
  if (input.publishedAt) lines.push(`Publish date: ${input.publishedAt}`);
  lines.push("", "Describe the photo now.");
  return lines.join("\n");
};

export const generateImageCaption = async (
  input: GenerateImageCaptionInput,
): Promise<GenerateImageCaptionResult> => {
  try {
    const completion = await openai.chat.completions.create(
      {
        model: IMAGE_CAPTION_MODEL,
        ...modelTuning(IMAGE_CAPTION_MODEL, 300),
        messages: [
          { role: "system", content: IMAGE_CAPTION_SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: buildImageContext(input) },
              {
                type: "image_url",
                image_url: {
                  url: input.imageUrl,
                  detail: IMAGE_CAPTION_DETAIL,
                },
              },
            ],
          },
        ],
      },
      { timeout: 30_000 },
    );
    const caption = (completion.choices[0]?.message?.content ?? "")
      .trim()
      .replace(/^["'«»]|["'«»]$/g, "")
      .trim();
    if (!caption) {
      throw new Error("Empty image caption from model");
    }
    return { caption, model: IMAGE_CAPTION_MODEL };
  } catch (error) {
    await logExternalServiceError({
      source: "OpenAI",
      type: "Blog Image Caption",
      message: error instanceof Error ? error.message : String(error),
      metadata: { model: IMAGE_CAPTION_MODEL },
    });
    throw error;
  }
};

// --- Per-video caption (transcript + article context) ---------------------

export const VIDEO_CAPTION_MODEL =
  process.env.BLOG_VIDEO_CAPTION_MODEL || "gpt-4o-mini";

const VIDEO_CAPTION_SYSTEM = `You'll be given the transcript and article context of a travel blog video: post title, region, continent, language, transcript / article text, and publish date. Read all of it and write a concise description of what the video is about, optimized for an English keyword search index.

Rules:
- Output a SINGLE short description in English (10-40 words).
- Capture the main subject, activity, place, people, events and themes of the video so keyword search can match it.
- Include proper nouns (city, country, landmark, person names) verbatim — they are the strongest search signals.
- Use plain declarative phrasing. No first person, no greetings, no emojis, no markdown.
- Do NOT invent facts that are not supported by the transcript/context. If the input is sparse, keep it short.
- Output ONLY the description text — no quotes, no preface.`;

export interface GenerateVideoCaptionInput {
  title: string;
  regionName: string;
  continentName: string;
  language: string;
  content: string;
  postCaption: string;
  publishedAt: string | null;
}

export interface GenerateVideoCaptionResult {
  caption: string;
  model: string;
}

const buildVideoContext = (input: GenerateVideoCaptionInput): string => {
  const lines: string[] = [];
  if (input.title) lines.push(`Post title: ${input.title}`);
  if (input.regionName) lines.push(`Region: ${input.regionName}`);
  if (input.continentName) lines.push(`Continent: ${input.continentName}`);
  if (input.language) lines.push(`Language: ${input.language}`);
  if (input.publishedAt) lines.push(`Publish date: ${input.publishedAt}`);
  if (input.postCaption) lines.push(`Post summary: ${input.postCaption}`);
  if (input.content) lines.push("", "Transcript / article:", input.content);
  lines.push("", "Write the search-index description now.");
  return lines.join("\n");
};

export const generateVideoCaption = async (
  input: GenerateVideoCaptionInput,
): Promise<GenerateVideoCaptionResult> => {
  try {
    const completion = await openai.chat.completions.create(
      {
        model: VIDEO_CAPTION_MODEL,
        ...modelTuning(VIDEO_CAPTION_MODEL, 300),
        messages: [
          { role: "system", content: VIDEO_CAPTION_SYSTEM },
          { role: "user", content: buildVideoContext(input) },
        ],
      },
      { timeout: 20_000 },
    );
    const caption = (completion.choices[0]?.message?.content ?? "")
      .trim()
      .replace(/^["'«»]|["'«»]$/g, "")
      .trim();
    if (!caption) {
      throw new Error("Empty video caption from model");
    }
    return { caption, model: VIDEO_CAPTION_MODEL };
  } catch (error) {
    await logExternalServiceError({
      source: "OpenAI",
      type: "Blog Video Caption",
      message: error instanceof Error ? error.message : String(error),
      metadata: { model: VIDEO_CAPTION_MODEL },
    });
    throw error;
  }
};
