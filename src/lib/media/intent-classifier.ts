import { logExternalServiceError } from "@/lib/logging/external-errors";
import { openai } from "@/lib/media/openai";
import type { IntentClassifierResult, MediaIntent } from "@/lib/media/types";

const VALID_INTENTS: readonly MediaIntent[] = [
  "search_information",
  "photo_from_blog",
  "video_from_blog",
  "photo_from_external",
  "video_from_external",
  "none",
];

const INTENT_CLASSIFIER_MODEL = "gpt-4o";

const SYSTEM_PROMPT = `You are an intent classifier for Neil's AI avatar chatbot. Neil is a travel blogger.

Analyze the user's message and recent chat history to determine the intent.

## Intents (in priority order):
1. search_information — user asks for real-time data: news, weather, exchange rates, current events, sports scores. These are rarely about Neil personally.
2. photo_from_blog — user wants photos related to Neil's personal experience, travels, or blog.
3. video_from_blog — user wants videos related to Neil's personal experience, travels, or blog.
4. photo_from_external — user wants photos from the internet, NOT related to Neil.
5. video_from_external — user wants videos from the internet, NOT related to Neil.
6. none — general conversation, questions about facts, jokes, greetings. No media or search needed.

## Key rules:
- If the request mentions Neil / his blog / his travels / his experience → use _from_blog variant
- If no explicit Neil context → use _from_external variant
- REAL-TIME DATA RULE (critical): any request for a current/live value — current or today's weather/temperature, exchange rates or currency conversion (including at a specific bank like PrivatBank), prices, stock or crypto quotes, sports scores, or news / "what's happening" — MUST be classified as search_information. The avatar must NEVER answer these from its own memory, even if it seems to know the number. Words like "now", "current", "today", "latest", "сейчас", "сегодня", "актуальный", "hoy", "ahora", "aujourd'hui" are strong signals.
- If the request contains BOTH a search trigger AND a media trigger (e.g. "show me photos of today's news") → choose by priority: search_information > photo/video
- Classify a real-time / current-data question as search_information even at moderate confidence — do NOT fall back to "none" for it. For the OTHER intents (media), if confidence < 0.7 → return "none".
- Follow-up messages like "show more" or "another one" → use chat history to determine the original intent

## Response format:
Respond with ONLY a JSON object, no other text.

For none:
{"intent": "none"}

For search_information:
{"intent": "search_information", "keywords": "english search keywords"}

For media intents:
{"intent": "photo_from_blog", "keywords": "english keywords, comma separated"}
{"intent": "video_from_blog", "keywords": "english keywords, comma separated"}
{"intent": "photo_from_external", "keywords": "english keywords, comma separated"}
{"intent": "video_from_external", "keywords": "english keywords, comma separated"}

IMPORTANT: Keywords MUST be in English regardless of the user's language.
IMPORTANT: Return ONLY valid JSON. No explanations.

## Examples:

User: "Какая сегодня погода в Нью-Йорке?"
{"intent": "search_information", "keywords": "weather New York today"}

User: "Покажи фото из твоей поездки в Индию"
{"intent": "photo_from_blog", "keywords": "India trip travel"}

User: "Покажи видео запуска SpaceX"
{"intent": "video_from_external", "keywords": "SpaceX rocket launch"}

User: "Покажи фото Эйфелевой башни"
{"intent": "photo_from_external", "keywords": "Eiffel Tower Paris"}

User: "Есть видео с твоего выступления?"
{"intent": "video_from_blog", "keywords": "speech presentation event"}

User: "Привет, как дела?"
{"intent": "none"}

User: "Что такое фотосинтез?"
{"intent": "none"}

User: "Последние новости про AI"
{"intent": "search_information", "keywords": "artificial intelligence AI latest news"}

User: "Какой сейчас курс доллара в Приватбанке?"
{"intent": "search_information", "keywords": "USD UAH exchange rate PrivatBank today"}

User: "Какая погода сейчас в Хьюстоне?"
{"intent": "search_information", "keywords": "Houston weather today temperature"}

User: "What's the dollar to euro rate today?"
{"intent": "search_information", "keywords": "USD EUR exchange rate today"}`;

export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

interface ClassifyIntentInput {
  message: string;
  history: HistoryEntry[];
}

const formatHistory = (history: HistoryEntry[]): string => {
  if (history.length === 0) return "(no prior messages)";
  return history
    .map(
      (entry) =>
        `${entry.role === "user" ? "User" : "Assistant"}: ${entry.content}`,
    )
    .join("\n");
};

const parseResponse = (
  raw: string | null | undefined,
): IntentClassifierResult => {
  if (!raw) return { intent: "none" };
  try {
    const parsed = JSON.parse(raw) as { intent?: unknown; keywords?: unknown };
    const intentRaw =
      typeof parsed.intent === "string"
        ? parsed.intent.trim().toLowerCase()
        : "";
    const intent = intentRaw as MediaIntent;
    if (!VALID_INTENTS.includes(intent)) return { intent: "none" };
    const keywords =
      typeof parsed.keywords === "string" && parsed.keywords.trim()
        ? parsed.keywords.trim()
        : undefined;
    if (intent === "none") return { intent: "none" };
    if (!keywords) return { intent: "none" };
    return { intent, keywords };
  } catch {
    return { intent: "none" };
  }
};

export const classifyIntent = async ({
  message,
  history,
}: ClassifyIntentInput): Promise<IntentClassifierResult> => {
  const startedAt = Date.now();
  try {
    const userPrompt = `Chat history:\n${formatHistory(history)}\n\nUser message: ${message}`;
    console.log("[media-intent][classify] request", {
      message: message.slice(0, 200),
      historyCount: history.length,
      model: INTENT_CLASSIFIER_MODEL,
    });

    const completion = await openai.chat.completions.create(
      {
        model: INTENT_CLASSIFIER_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      },
      { timeout: 10_000 },
    );
    const raw = completion.choices[0]?.message?.content ?? null;
    const parsed = parseResponse(raw);
    console.log("[media-intent][classify] response", {
      raw,
      parsed,
      elapsedMs: Date.now() - startedAt,
    });
    return parsed;
  } catch (error) {
    console.error("[media-intent][classify] error", {
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - startedAt,
    });
    await logExternalServiceError({
      source: "OpenAI",
      type: "Intent Classifier",
      message: error instanceof Error ? error.message : String(error),
      metadata: { model: INTENT_CLASSIFIER_MODEL },
    });
    return { intent: "none" };
  }
};
