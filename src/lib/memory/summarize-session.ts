import { logExternalServiceError } from "@/lib/logging/external-errors";
import { openai } from "@/lib/media/openai";

const MEMORY_MODEL = "gpt-4o-mini";

// Hard cap on the stored summary so it stays cheap to inject into every
// future turn alongside the full live conversation. ~700 chars ≈ 200 tokens.
export const MAX_SUMMARY_CHARS = 700;

export interface SessionTurn {
  role: "user" | "assistant";
  content: string;
}

export interface MemoryUpdate {
  summary: string;
  displayName: string | null;
}

const SYSTEM_PROMPT = `You maintain a COMPACT, durable memory profile of a visitor who chats with Neil's AI avatar (a travel blogger). You receive the EXISTING memory and the LATEST conversation, and return an UPDATED memory.

Rules:
- Output STRICT JSON: {"summary": string, "displayName": string|null}.
- "summary": third-person notes about the visitor that are useful to remember for future conversations — their name (if given), interests, what they asked about, stated preferences, language, important personal context they shared, and any commitments Neil made. MERGE new facts into the existing summary; drop outdated or trivial small-talk.
- Keep "summary" UNDER ${MAX_SUMMARY_CHARS} characters. Be terse, factual, no fluff. Plain text, no markdown, no bullet symbols required (short sentences or semicolons are fine).
- Write the summary in English regardless of the conversation language (it is internal memory).
- "displayName": the visitor's first name / preferred name if known, else null.
- Never invent facts. If nothing durable was shared and there is no prior memory, return an empty summary "".
- Do not include the avatar's own biography — only what matters about THIS visitor.`;

const clip = (text: string): string =>
  text.length > MAX_SUMMARY_CHARS
    ? `${text.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…`
    : text;

const formatTurns = (turns: SessionTurn[]): string =>
  turns
    .map((t) => `${t.role === "user" ? "Visitor" : "Neil"}: ${t.content}`)
    .join("\n");

export const summarizeSession = async (
  previousSummary: string,
  turns: SessionTurn[],
): Promise<MemoryUpdate | null> => {
  const meaningfulTurns = turns.filter((t) => t.content.trim().length > 0);
  if (meaningfulTurns.length === 0) return null;

  try {
    const userPrompt = `EXISTING MEMORY:\n${previousSummary.trim() || "(none)"}\n\nLATEST CONVERSATION:\n${formatTurns(meaningfulTurns)}\n\nReturn the updated memory JSON now.`;

    const completion = await openai.chat.completions.create(
      {
        model: MEMORY_MODEL,
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      },
      { timeout: 15_000 },
    );
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      summary?: unknown;
      displayName?: unknown;
    };
    const summary =
      typeof parsed.summary === "string" ? clip(parsed.summary.trim()) : "";
    const displayName =
      typeof parsed.displayName === "string" && parsed.displayName.trim()
        ? parsed.displayName.trim().slice(0, 80)
        : null;
    return { summary, displayName };
  } catch (error) {
    await logExternalServiceError({
      source: "OpenAI",
      type: "Session Memory",
      message: error instanceof Error ? error.message : String(error),
      metadata: { model: MEMORY_MODEL },
    });
    return null;
  }
};
