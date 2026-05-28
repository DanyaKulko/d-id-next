import axios, { type AxiosInstance } from "axios";
import {
  isAxiosError,
  logExternalServiceError,
  resolveExternalErrorDetails,
} from "@/lib/logging/external-errors";
import type { WebSearchResult } from "@/lib/media/types";

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

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  extra_snippets?: string[];
}

const decodeHtml = (s: string): string =>
  s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, " ");

export const searchWeb = async (
  keywords: string,
  limit = 5,
): Promise<WebSearchResult[]> => {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    console.warn("BRAVE_API_KEY is missing — web search disabled");
    return [];
  }
  const query = keywords.trim();
  if (!query) return [];

  try {
    const response = await getClient().get("/web/search", {
      headers: { "X-Subscription-Token": apiKey },
      params: {
        q: query,
        count: Math.max(1, Math.min(20, limit)),
        safesearch: "moderate",
        // Real-time queries dominate this surface (weather, scores, rates,
        // news). Past-week freshness biases Brave toward current snippets
        // instead of years-old pages.
        freshness: "pw",
        text_decorations: false,
      },
    });
    const results: BraveWebResult[] = Array.isArray(response.data?.web?.results)
      ? response.data.web.results
      : [];

    return results.slice(0, limit).map((r) => {
      const description = r.description ? decodeHtml(r.description) : "";
      const snippet =
        description ||
        (Array.isArray(r.extra_snippets) && r.extra_snippets[0]
          ? decodeHtml(r.extra_snippets[0])
          : "");
      return {
        title: r.title?.trim() ?? "",
        snippet,
        link: r.url?.trim() ?? "",
      };
    });
  } catch (error) {
    if (isAxiosError(error)) {
      const details = resolveExternalErrorDetails(error);
      await logExternalServiceError({
        source: "Brave",
        type: "Web Search",
        message: details.message,
        metadata: details.metadata,
      });
    } else {
      console.warn("Brave web search failed", error);
    }
    return [];
  }
};
