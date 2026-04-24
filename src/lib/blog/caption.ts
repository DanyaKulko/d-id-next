import { logExternalServiceError } from "@/lib/logging/external-errors";
import { openai } from "@/lib/media/openai";

export const POST_CAPTION_MODEL = "gpt-4o-mini";
export const IMAGE_CAPTION_MODEL = "gpt-4o";

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
        temperature: 0.2,
        max_tokens: 220,
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
