import axios, { type AxiosInstance } from "axios";
import {
  isAxiosError,
  logExternalServiceError,
  resolveExternalErrorDetails,
} from "@/lib/logging/external-errors";
import type { MediaItem } from "@/lib/media/types";

let client: AxiosInstance | null = null;

const getClient = (): AxiosInstance => {
  if (!client) {
    client = axios.create({
      baseURL: "https://api.search.brave.com/res/v1",
      timeout: 8000,
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
      },
    });
  }
  return client;
};

interface BraveThumbnail {
  src?: string;
  width?: number;
  height?: number;
}

interface BraveImageProperties {
  url?: string;
  width?: number;
  height?: number;
}

interface BraveImageResult {
  title?: string;
  url?: string;
  source?: string;
  thumbnail?: BraveThumbnail;
  properties?: BraveImageProperties;
}

const sanitizeUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^https?:\/\//i.test(trimmed)) return undefined;
  return trimmed;
};

export const searchImages = async (
  keywords: string,
  limit = 4,
): Promise<MediaItem[]> => {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    console.warn("BRAVE_API_KEY is missing — image search disabled");
    return [];
  }
  const query = keywords.trim();
  if (!query) return [];

  try {
    const response = await getClient().get("/images/search", {
      headers: { "X-Subscription-Token": apiKey },
      params: {
        q: query,
        count: Math.max(limit * 2, 10),
        safesearch: "strict",
        search_lang: "en",
        country: "US",
        spellcheck: 1,
      },
    });
    const items: BraveImageResult[] = Array.isArray(response.data?.results)
      ? response.data.results
      : [];

    const out: MediaItem[] = [];
    for (const item of items) {
      const fullUrl = sanitizeUrl(item.properties?.url);
      const thumbUrl = sanitizeUrl(item.thumbnail?.src);
      const resolvedUrl = fullUrl ?? thumbUrl;
      if (!resolvedUrl) continue;

      const pageUrl = sanitizeUrl(item.url) ?? resolvedUrl;
      const title = item.title?.trim() || "Image";
      const host = item.source?.trim() || undefined;

      out.push({
        id: `brave-img-${out.length}-${resolvedUrl.slice(-32)}`,
        kind: "photo",
        url: resolvedUrl,
        thumbnailUrl: thumbUrl ?? resolvedUrl,
        title,
        source: host,
        link: pageUrl,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch (error) {
    if (isAxiosError(error)) {
      const details = resolveExternalErrorDetails(error);
      await logExternalServiceError({
        source: "Brave",
        type: "Image Search",
        message: details.message,
        metadata: details.metadata,
      });
    } else {
      console.warn("Brave image search failed", error);
    }
    return [];
  }
};
