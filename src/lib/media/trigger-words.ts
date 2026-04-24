import {
  NEWS_TRIGGERS_RAW,
  PHOTO_TRIGGERS_RAW,
  VIDEO_TRIGGERS_RAW,
} from "@/lib/media/data/trigger-words-data";

type TriggerCategory = "news" | "photo" | "video";

const WORD_SPLIT_RE = /[\s,.!?;:\-—«»"'()[\]/\\]+/u;

const normalize = (text: string): string =>
  text.toLowerCase().normalize("NFKC");

const tokenize = (text: string): string[] =>
  normalize(text)
    .split(WORD_SPLIT_RE)
    .filter((token) => token.length > 0);

interface TriggerIndex {
  all: Set<string>;
  byCategory: Record<TriggerCategory, Set<string>>;
}

const ingest = (raw: string, bucket: Set<string>, all: Set<string>) => {
  for (const entry of raw.split(",")) {
    const phrase = normalize(entry).trim();
    if (!phrase) continue;
    bucket.add(phrase);
    all.add(phrase);
    for (const token of tokenize(phrase)) {
      if (token.length >= 2) {
        bucket.add(token);
        all.add(token);
      }
    }
  }
};

const buildIndex = (): TriggerIndex => {
  const byCategory: Record<TriggerCategory, Set<string>> = {
    news: new Set(),
    photo: new Set(),
    video: new Set(),
  };
  const all = new Set<string>();
  ingest(NEWS_TRIGGERS_RAW, byCategory.news, all);
  ingest(PHOTO_TRIGGERS_RAW, byCategory.photo, all);
  ingest(VIDEO_TRIGGERS_RAW, byCategory.video, all);
  return { all, byCategory };
};

let cachedIndex: TriggerIndex | null = null;

const getIndex = (): TriggerIndex => {
  if (!cachedIndex) {
    cachedIndex = buildIndex();
  }
  return cachedIndex;
};

export const hasAnyTrigger = (text: string): boolean => {
  const index = getIndex();
  const tokens = tokenize(text);
  if (tokens.length === 0) return false;

  for (const token of tokens) {
    if (index.all.has(token)) return true;
  }
  const normalizedFull = normalize(text);
  for (const phrase of index.all) {
    if (phrase.includes(" ") && normalizedFull.includes(phrase)) return true;
  }
  return false;
};

export const detectTriggerCategory = (text: string): TriggerCategory | null => {
  const index = getIndex();
  const tokens = tokenize(text);
  const normalizedFull = normalize(text);

  const categories: TriggerCategory[] = ["news", "video", "photo"];
  for (const category of categories) {
    const bucket = index.byCategory[category];
    if (tokens.some((token) => bucket.has(token))) return category;
    for (const phrase of bucket) {
      if (phrase.includes(" ") && normalizedFull.includes(phrase)) {
        return category;
      }
    }
  }
  return null;
};
