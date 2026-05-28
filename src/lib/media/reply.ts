import { logExternalServiceError } from "@/lib/logging/external-errors";
import { openai } from "@/lib/media/openai";

const REPLY_MODEL = "gpt-4o-mini";

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

export type MediaReplyOutcome =
  | "blog"
  | "external_fallback"
  | "external"
  | "none";
export type MediaReplyKind = "photo" | "video";

const buildSystemPrompt = (languageName: string): string =>
  `You are Neil, a friendly travel-blogger AI avatar talking to a visitor on a live video call. Generate ONE short spoken sentence (max ~16 words) that acknowledges the visitor's media request and naturally references the SUBJECT of what they asked for.

CRITICAL LANGUAGE RULE — NON-NEGOTIABLE:
- Write the ENTIRE sentence in ${languageName}.
- Do NOT use English unless ${languageName} is English.
- The subject of the request (e.g. "camels", "bananas", "the Eiffel Tower") must also be rendered in ${languageName} (translated or transliterated naturally), not left in the visitor's original wording if it differs.
- Use correct ${languageName} grammar — cases, prepositions, gender, agreement.

You receive: the visitor's message, the target language, the media kind (photo/video), and the outcome.

Outcome meanings:
- "blog": You found photo(s)/video(s) from YOUR OWN travels / personal experience that match the request. Warm, first person.
  RU example: "Вот фото с верблюдами из моих путешествий."
- "external_fallback": You did NOT have it in your own blog, but found it online. Mention both facts.
  RU example: "Фото бананов в блоге я не нашёл, но вот что нашлось в интернете."
- "external": You found photo(s)/video(s) online (the request was not about you personally).
  RU example: "Вот фото бананов, которые я нашёл."
- "none": You could not find anything for this request.
  RU example: "К сожалению, фото бананов мне найти не удалось."

Rules:
- Reply ONLY with the single sentence, nothing else. No quotes, no emojis, no markdown.
- First person, as Neil. Keep it natural and conversational, suitable to be spoken aloud.
- Insert the subject of the request; do not invent details that weren't asked.`;

interface ComposeMediaReplyInput {
  userMessage: string;
  language?: string;
  kind: MediaReplyKind;
  outcome: MediaReplyOutcome;
  fallbackPhrase: string;
}

export const composeMediaReply = async ({
  userMessage,
  language,
  kind,
  outcome,
  fallbackPhrase,
}: ComposeMediaReplyInput): Promise<string> => {
  const trimmed = userMessage.trim();
  if (!trimmed) return fallbackPhrase;

  try {
    const languageName = resolveLanguageName(language);
    const userPrompt = `Target language: ${languageName} (write the sentence in this language).\nMedia kind: ${kind}\nOutcome: ${outcome}\nVisitor's message: "${trimmed}"\n\nWrite the sentence now, in ${languageName}.`;

    const completion = await openai.chat.completions.create(
      {
        model: REPLY_MODEL,
        temperature: 0.2,
        max_tokens: 80,
        messages: [
          { role: "system", content: buildSystemPrompt(languageName) },
          { role: "user", content: userPrompt },
        ],
      },
      { timeout: 8000 },
    );
    const text = completion.choices[0]?.message?.content?.trim();
    if (text) {
      return text.replace(/^["'«»]|["'«»]$/g, "").trim();
    }
    return fallbackPhrase;
  } catch (error) {
    await logExternalServiceError({
      source: "OpenAI",
      type: "Media Reply",
      message: error instanceof Error ? error.message : String(error),
      metadata: { model: REPLY_MODEL, kind, outcome },
    });
    return fallbackPhrase;
  }
};
