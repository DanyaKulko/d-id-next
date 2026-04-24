import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";

const OAUTH_URL =
  process.env.DOND_OAUTH_URL ||
  "https://www.dondemineilstravels.com/oauth/token";
const POSTS_URL =
  process.env.DOND_POSTS_URL ||
  "https://www.dondemineilstravels.com/api/v2/posts";

const TOKEN_USERNAME = process.env.DOND_OAUTH_USERNAME;
const TOKEN_PASSWORD = process.env.DOND_OAUTH_PASSWORD;
const TOKEN_CLIENT_ID = process.env.DOND_OAUTH_CLIENT_ID || "2";
const TOKEN_CLIENT_SECRET = process.env.DOND_OAUTH_CLIENT_SECRET;

const DEFAULT_TIMEOUT_MS = 20_000;
const REFRESH_MARGIN_MS = 60 * 60 * 1000;

type Logger = (
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  meta?: Record<string, unknown>,
) => void;

const noopLogger: Logger = () => undefined;

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface BlogApiClientOptions {
  log?: Logger;
  timeoutMs?: number;
}

export interface BlogApiPagedResponse<T> {
  data: T[];
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export class BlogApiClient {
  private cached: CachedToken | null = null;
  private readonly http: AxiosInstance;
  private readonly log: Logger;

  constructor(options: BlogApiClientOptions = {}) {
    this.log = options.log ?? noopLogger;
    this.http = axios.create({
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      headers: { Accept: "application/json" },
    });
  }

  async getToken(force = false): Promise<string> {
    const now = Date.now();
    if (
      !force &&
      this.cached &&
      this.cached.expiresAt - REFRESH_MARGIN_MS > now
    ) {
      return this.cached.token;
    }

    if (!TOKEN_USERNAME || !TOKEN_PASSWORD || !TOKEN_CLIENT_SECRET) {
      throw new Error(
        "Missing DOND_OAUTH_* credentials (USERNAME, PASSWORD, CLIENT_SECRET)",
      );
    }

    const { data } = await axios.post(
      OAUTH_URL,
      {
        username: TOKEN_USERNAME,
        password: TOKEN_PASSWORD,
        grant_type: "password",
        scope: "*",
        client_id: TOKEN_CLIENT_ID,
        client_secret: TOKEN_CLIENT_SECRET,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: DEFAULT_TIMEOUT_MS,
      },
    );

    const token = data?.access_token;
    if (typeof token !== "string" || !token) {
      throw new Error("OAuth response did not include an access_token");
    }
    const expiresIn =
      typeof data?.expires_in === "number" ? data.expires_in : 15 * 24 * 3600;

    const expiresAt = Math.max(
      Date.now() + expiresIn * 1000,
      Date.now() + 5 * 60 * 1000 + REFRESH_MARGIN_MS,
    );

    this.cached = { token, expiresAt };
    this.log("INFO", "Blog API token refreshed", { expiresIn });
    return token;
  }

  async get<T>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
    const attempt = async (force = false): Promise<T> => {
      const token = await this.getToken(force);
      const { data } = await this.http.get<T>(url, {
        ...config,
        headers: {
          ...(config.headers ?? {}),
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      return data;
    };

    try {
      return await attempt();
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        this.cached != null
      ) {
        this.cached = null;
        this.log("WARN", "Blog API 401 → forcing token refresh");
        return attempt(true);
      }
      throw error;
    }
  }

  async getPosts(
    params: Record<string, unknown> = {},
  ): Promise<BlogApiPagedResponse<BlogApiPost>> {
    return this.get<BlogApiPagedResponse<BlogApiPost>>(POSTS_URL, { params });
  }
}

export interface BlogApiMediaItem {
  id: number | string;
  uuid?: string;
  collection_name?: string;
  mime_type?: string;
  original_url?: string;
  preview_url?: string;
  name?: string;
  file_name?: string;
  order_column?: number;
}

export interface BlogApiVideoAssets {
  hls?: string;
  iframe?: string;
  mp4?: string;
  thumbnail?: string;
  player?: string;
}

export interface BlogApiVideo {
  videoId?: string;
  title?: string;
  description?: string;
  language?: string;
  assets?: BlogApiVideoAssets;
}

export interface BlogApiRegion {
  id?: number;
  name?: string;
  continent?: { id?: number; name?: string };
}

export interface BlogApiPost {
  id: number;
  type: number;
  type_name?: string;
  title: string;
  introduction?: string | null;
  description?: string | null;
  status?: boolean;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  link?: string | null;
  smart_image?: string | null;
  video_id?: string | null;
  video_transcript?: string | null;
  video?: BlogApiVideo | null;
  region?: BlogApiRegion | null;
  media?: BlogApiMediaItem[] | null;
  tags?: Array<{ id: number; name: string }> | null;
}
