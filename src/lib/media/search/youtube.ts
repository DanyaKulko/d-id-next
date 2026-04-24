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
      baseURL: "https://www.googleapis.com/youtube/v3",
      timeout: 8000,
    });
  }
  return client;
};

interface YoutubeSearchItem {
  id?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
      maxres?: { url?: string };
    };
  };
}

export const searchVideos = async (
  keywords: string,
  limit = 4,
): Promise<MediaItem[]> => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];
  const query = keywords.trim();
  if (!query) return [];

  try {
    const response = await getClient().get("/search", {
      params: {
        key: apiKey,
        part: "snippet",
        type: "video",
        q: query,
        safeSearch: "moderate",
        maxResults: Math.max(1, Math.min(10, limit)),
        videoEmbeddable: "true",
      },
    });
    const items = Array.isArray(response.data?.items)
      ? (response.data.items as YoutubeSearchItem[])
      : [];

    const result: MediaItem[] = [];
    for (const item of items) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;
      const thumbnails = item.snippet?.thumbnails;
      const thumbnailUrl =
        thumbnails?.high?.url ??
        thumbnails?.medium?.url ??
        thumbnails?.default?.url ??
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const title = item.snippet?.title?.trim() || "YouTube video";
      const channelTitle = item.snippet?.channelTitle?.trim();
      result.push({
        id: `yt-${videoId}`,
        kind: "video",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnailUrl,
        title,
        source: channelTitle,
        link: `https://www.youtube.com/watch?v=${videoId}`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
      });
      if (result.length >= limit) break;
    }
    return result;
  } catch (error) {
    if (isAxiosError(error)) {
      const details = resolveExternalErrorDetails(error);
      await logExternalServiceError({
        source: "YouTube",
        type: "Video Search",
        message: details.message,
        metadata: details.metadata,
      });
    } else {
      console.warn("YouTube search failed", error);
    }
    return [];
  }
};
