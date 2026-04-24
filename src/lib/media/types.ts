export type MediaIntent =
  | "search_information"
  | "photo_from_blog"
  | "video_from_blog"
  | "photo_from_external"
  | "video_from_external"
  | "none";

export type MediaItemKind = "photo" | "video";

export interface MediaItem {
  id: string;
  kind: MediaItemKind;
  url: string;
  thumbnailUrl: string;
  title: string;
  source?: string;
  link?: string;
  embedUrl?: string;
}

export interface MediaResolveResult {
  intent: MediaIntent;
  items: MediaItem[];
  spokenText?: string;
  blogFallback?: boolean;
}

export interface IntentClassifierResult {
  intent: MediaIntent;
  keywords?: string;
}

export interface WebSearchResult {
  title: string;
  snippet: string;
  link: string;
}
