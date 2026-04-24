import type { MediaIntent } from "@/lib/media/types";

type PhraseKey =
  | "photo_from_external"
  | "video_from_external"
  | "photo_from_blog"
  | "video_from_blog"
  | "photo_from_blog_fallback"
  | "video_from_blog_fallback"
  | "no_results";

const DEFAULT_LANGUAGE = "en-US";

const PHRASES: Record<PhraseKey, Record<string, string>> = {
  photo_from_external: {
    "en-US": "Here are the photos you asked for.",
    "ru-RU": "Вот фото, которое ты просил.",
    "es-ES": "Aquí tienes las fotos que me pediste.",
    "fr-FR": "Voici les photos que tu as demandées.",
    "id-ID": "Ini foto yang kamu minta.",
    "hi-IN": "ये रहीं वो तस्वीरें जो तुमने माँगी थीं।",
    "mr-IN": "तुम्ही मागितलेले फोटो हे आहेत.",
  },
  video_from_external: {
    "en-US": "Here's the video you asked for.",
    "ru-RU": "Вот видео, которое ты просил.",
    "es-ES": "Aquí tienes el video que pediste.",
    "fr-FR": "Voici la vidéo que tu as demandée.",
    "id-ID": "Ini video yang kamu minta.",
    "hi-IN": "ये रहा वो वीडियो जो तुमने माँगा था।",
    "mr-IN": "तुम्ही मागितलेला व्हिडिओ हा आहे.",
  },
  photo_from_blog: {
    "en-US": "Here's a photo from my travels.",
    "ru-RU": "Вот фото из моих путешествий.",
    "es-ES": "Aquí tienes una foto de mis viajes.",
    "fr-FR": "Voici une photo de mes voyages.",
    "id-ID": "Ini foto dari perjalananku.",
    "hi-IN": "ये रही मेरी यात्रा की एक तस्वीर।",
    "mr-IN": "माझ्या प्रवासातील हा फोटो आहे.",
  },
  video_from_blog: {
    "en-US": "Here's a video from my travels.",
    "ru-RU": "Вот видео из моих путешествий.",
    "es-ES": "Aquí tienes un video de mis viajes.",
    "fr-FR": "Voici une vidéo de mes voyages.",
    "id-ID": "Ini video dari perjalananku.",
    "hi-IN": "ये रहा मेरी यात्रा का एक वीडियो।",
    "mr-IN": "माझ्या प्रवासातील हा व्हिडिओ आहे.",
  },
  photo_from_blog_fallback: {
    "en-US":
      "I don't have that in my blog yet, but here's what I found online.",
    "ru-RU": "В моём блоге такого пока нет, но вот что я нашёл в интернете.",
    "es-ES":
      "Todavía no tengo eso en mi blog, pero aquí hay algo que encontré en internet.",
    "fr-FR":
      "Je n'ai pas encore ça sur mon blog, mais voici ce que j'ai trouvé en ligne.",
    "id-ID": "Belum ada di blog saya, tapi ini yang saya temukan di internet.",
    "hi-IN": "मेरे ब्लॉग में अभी ये नहीं है, लेकिन ये रहा जो मुझे ऑनलाइन मिला।",
    "mr-IN": "माझ्या ब्लॉगमध्ये अजून हे नाही, पण इंटरनेटवर हे सापडले.",
  },
  video_from_blog_fallback: {
    "en-US":
      "I don't have a video of that yet, but here's what I found online.",
    "ru-RU":
      "Своего видео про это у меня пока нет, но вот что нашлось в интернете.",
    "es-ES": "Aún no tengo un video propio, pero esto encontré en internet.",
    "fr-FR":
      "Je n'ai pas encore de vidéo là-dessus, mais voici ce que j'ai trouvé en ligne.",
    "id-ID": "Belum punya videonya, tapi ini yang saya temukan di internet.",
    "hi-IN": "मेरा अपना वीडियो अभी नहीं है, पर ये रहा जो ऑनलाइन मिला।",
    "mr-IN": "माझा स्वतःचा व्हिडिओ अजून नाही, पण इंटरनेटवर हे सापडले.",
  },
  no_results: {
    "en-US":
      "I couldn't find anything for that. Want to try a different wording?",
    "ru-RU": "Ничего не нашлось. Попробуем другой запрос?",
    "es-ES": "No encontré nada. ¿Probamos con otras palabras?",
    "fr-FR": "Je n'ai rien trouvé. On essaie une autre formulation ?",
    "id-ID": "Saya tidak menemukan apa pun. Mau coba kata lain?",
    "hi-IN": "मुझे कुछ नहीं मिला। कुछ और शब्द आज़माएँ?",
    "mr-IN": "मला काहीच सापडले नाही. दुसरे शब्द वापरू का?",
  },
};

const pick = (key: PhraseKey, language?: string): string => {
  const bucket = PHRASES[key];
  if (!bucket) return "";
  if (language && bucket[language]) return bucket[language];
  const short = language?.slice(0, 2);
  if (short) {
    const match = Object.keys(bucket).find((k) => k.startsWith(`${short}-`));
    if (match) return bucket[match];
  }
  return bucket[DEFAULT_LANGUAGE] ?? "";
};

export const phraseForIntent = (
  intent: MediaIntent,
  language?: string,
  options?: { blogFallback?: boolean },
): string => {
  switch (intent) {
    case "photo_from_external":
      return pick("photo_from_external", language);
    case "video_from_external":
      return pick("video_from_external", language);
    case "photo_from_blog":
      return pick(
        options?.blogFallback ? "photo_from_blog_fallback" : "photo_from_blog",
        language,
      );
    case "video_from_blog":
      return pick(
        options?.blogFallback ? "video_from_blog_fallback" : "video_from_blog",
        language,
      );
    default:
      return "";
  }
};

export const phraseForNoResults = (language?: string): string =>
  pick("no_results", language);
