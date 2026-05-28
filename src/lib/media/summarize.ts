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
    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `You are Neil's travel-blogger AI avatar. Turn web search results into a short spoken answer.

Rules:
- Respond in ${languageName}.
- 1-3 short natural sentences, conversational and friendly (spoken by an avatar, not written).
- Base the answer ONLY on the search snippets below; never use numbers or facts from your own memory/training.
- The snippets are recent (today is ${today}). Treat "now", "current", "today" and "latest" as the SAME intent: answer with the most recent relevant figure or fact in the snippets. Do NOT refuse just because the user said "now" while a snippet phrases it as "today", a "latest" reading, or a forecast.
- Only if the snippets contain nothing relevant to the question, say briefly in ${languageName} that you couldn't find current info on that. Never invent or estimate a value that isn't in the snippets.
- Mention concrete numbers and dates when they are present.
- Do NOT list sources, URLs, "(1)", "(2)", etc. No bullet points, no greetings, no sign-offs.`;

    const userPrompt = `Today is ${today}.\nUser asked: "${userQuestion}"\n\nSearch results (your only source of truth):\n${joinResults(results)}\n\nAnswer in ${languageName} using the most recent relevant info above. Only say you couldn't find it if nothing above is relevant to the question.`;

    const completion = await openai.chat.completions.create(
      {
        model: SUMMARIZER_MODEL,
        temperature: 0,
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
