import { logExternalServiceError } from "@/lib/logging/external-errors";
import { openai } from "@/lib/media/openai";
import type { WebSearchResult } from "@/lib/media/types";

const SUMMARIZER_MODEL = "gpt-4o-mini";

const LANGUAGE_NAMES: Record<string, string> = {
  "en-US": "English",
  "ru-RU": "Russian",
  "es-ES": "Spanish",
  "fr-FR": "French",
  "id-ID": "Indonesian",
  "hi-IN": "Hindi",
  "mr-IN": "Marathi",
};

const resolveLanguageName = (code?: string): string => {
  if (!code) return "English";
  return LANGUAGE_NAMES[code] ?? LANGUAGE_NAMES[code.slice(0, 2)] ?? "English";
};

const joinResults = (results: WebSearchResult[]): string =>
  results
    .slice(0, 5)
    .map(
      (r, index) =>
        `(${index + 1}) ${r.title}\n${r.snippet}${r.link ? `\nSource: ${r.link}` : ""}`,
    )
    .join("\n\n");

const fallbackSummary = (results: WebSearchResult[]): string => {
  if (results.length === 0)
    return "I couldn't find anything relevant right now.";
  const top = results[0];
  return top.snippet || top.title || "Here is what I found.";
};

export const summarizeSearch = async (
  results: WebSearchResult[],
  userQuestion: string,
  language?: string,
): Promise<string> => {
  if (results.length === 0) {
    return fallbackSummary(results);
  }
  try {
    const languageName = resolveLanguageName(language);
    const systemPrompt = `You are Neil's travel-blogger AI avatar. Summarize web search results into a spoken answer.

Rules:
- Respond in ${languageName}.
- 1-3 short natural sentences, conversational and friendly (spoken by an avatar, not written).
- Mention concrete numbers/dates when present (weather, scores, currency rates, etc.).
- Do NOT list sources, URLs, "(1)", "(2)", etc. No bullet points.
- Do NOT add greetings or sign-offs.`;

    const userPrompt = `User asked: "${userQuestion}"\n\nSearch results:\n${joinResults(results)}\n\nAnswer now.`;

    const completion = await openai.chat.completions.create(
      {
        model: SUMMARIZER_MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      },
      { timeout: 12_000 },
    );
    const text = completion.choices[0]?.message?.content?.trim();
    if (text) return text;
    return fallbackSummary(results);
  } catch (error) {
    await logExternalServiceError({
      source: "OpenAI",
      type: "Search Summarizer",
      message: error instanceof Error ? error.message : String(error),
      metadata: { model: SUMMARIZER_MODEL },
    });
    return fallbackSummary(results);
  }
};
