import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import { Worker } from "bullmq";
import OpenAI from "openai";
import { prisma } from "@/lib/db/prisma";
import { resolveBaseUrl } from "@/lib/http/base-url";
import { didService } from "@/lib/services/did.service";
import {
  defaultBlogCategoryCatalog,
  normalizeTrainingCategoryIds,
  resolveBlogCategoryTitle,
  trainingLimits,
  trainingSourceLabels,
} from "@/lib/training/knowledge-config";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TOKEN_URL =
  process.env.DOND_OAUTH_URL ||
  "https://www.dondemineilstravels.com/oauth/token";
const TOKEN_USERNAME = process.env.DOND_OAUTH_USERNAME;
const TOKEN_PASSWORD = process.env.DOND_OAUTH_PASSWORD;
const TOKEN_CLIENT_ID = process.env.DOND_OAUTH_CLIENT_ID || "2";
const TOKEN_CLIENT_SECRET = process.env.DOND_OAUTH_CLIENT_SECRET;
const API_PAGE_LIMIT = 50;

const SYSTEM_PROMPT = `
<goal>
Process existing text for subsequent training of an LLM model (the LLM’s task is to create a complete digital copy of Neil). We are processing Neil’s blog-diary. It is important that the final text:
— sounds like Neil’s direct speech (first person);
— contains no noise, external context, or other people’s voices;
— is compact and substantive;
— preserves Neil’s style, manner, narrative quirks, and distinctive voice.
</goal>

<response_format>
What is important to preserve in the text:
— Neil’s personal observations about people, places, phenomena, and events.
— His opinions, evaluations, and judgments (do not soften or “correct” them).
— Irony, dry humor, and characteristic intonations — if they are present in the source.
— Facts — only those that Neil explicitly states or clearly interprets himself.
— Preserve Neil’s temporal perspective if he indicates it.

Response format:
— Clean, classic Markdown.
— The text must be self-contained and read as a coherent line of reasoning, even if the source consisted of fragments.
— Output only the final processed text. No comments, no notes like “removed/edited,” no explanations of the process. No additional headings such as “Here is the result” — only the text itself.
— The final text must not exceed ${trainingLimits.targetSummarizedPostChars} characters including spaces.
</response_format>

<warnings>
What must be completely removed (without exceptions)

Universal for all sources:
— Remove everything that is not part of Neil’s personal experience and carries no meaningful value.
— Empty phrases, vague or “watery” constructions, filler words, excessive repetition, bureaucratic language.
— Greetings and farewells.
— Quotes from other people, news excerpts.
— Calls to subscribe.
— Avoid generalizations and universal formulations; the text must sound like personal experience, not conclusions “for everyone.”

Additionally, for video and audio transcriptions, remove:
— Timecodes, timestamps, segment numbers.
— Any references to the recording/filming process: “I’m filming,” “camera,” “microphone,” “I’ll record,” “on camera,” “you see,” “listen.”
— Speech noise and fillers: “uh,” “um,” “like,” false starts, self-corrections, stutters, placeholder phrases.
— Technical speech-recognition notes: [laughter], [noise], [pause], [inaudible] (unless they are critical to meaning or humor).
</warnings>

<context>
We are creating a digital copy of the personality Anil (Neil) Marathe. Our task is to process his materials (written blogs and video subtitles) and turn them into high-quality training data for his digital copy in the form of an AI avatar.

You are an editor and preprocessor of training data. Your task is to transform raw material into clean, coherent, self-contained first-person text suitable for training an LLM model that accurately reproduces Neil’s personality, thinking style, tone, humor, mannerisms, and personal observations.
</context>`;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const log = (
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  meta?: Record<string, unknown>,
) => {
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  const line = `[knowledge-sync][${level}] ${message}${payload}`;
  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
};

interface ApiPost {
  id: number;
  title: string;
  introduction: string | null;
  description: string | null;
  video_transcript: string | null;
  created_at?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
}

const normalizeBrokenPunctuation = (value: string) =>
  value
    .replace(/\uFEFF/g, "")
    .replace(/вЂ—|вЂ”|â€”|Ђ—|Ђ”|—|–/g, "-")
    .replace(/вЂ“|â€“|Ђ“/g, "-")
    .replace(/вЂ¦|â€¦|Ђ¦|…/g, "...")
    .replace(/вЂњ|вЂќ|â€œ|â€|Ђњ|Ђќ/g, '"')
    .replace(/вЂ˜|вЂ™|â€˜|â€™|Ђ˜|Ђ™|Ђљ/g, "'")
    .replace(/[“”«»„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/Â/g, " ");

const decodeHtmlEntities = (value: string) => {
  let text = normalizeBrokenPunctuation(value)
    .replace(/Ђ™/g, "'")
    .replace(/â€™/g, "'")
    .replace(/Ã¢â‚¬â„¢/g, "'");

  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&mdash;/gi, "-")
    .replace(/&ndash;/gi, "-");

  return normalizeBrokenPunctuation(text);
};

const normalizeTypography = (value: string) => {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\u2026/g, "...");
};

const stripHtml = (value: string) => {
  if (!value) return "";
  const withoutTags = value.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(withoutTags);
  const normalized = normalizeTypography(decoded);
  return normalized.replace(/\s+/g, " ").trim();
};

const normalizeKnowledgeText = (value: string) => {
  if (!value) return "";
  const decoded = decodeHtmlEntities(value);
  const normalized = normalizeTypography(decoded);
  return normalized
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const resolvePostDate = (post: ApiPost) =>
  post.created_at ||
  post.published_at ||
  post.updated_at ||
  new Date().toISOString();

const extractKnowledgeBaseId = (payload: Record<string, unknown>) => {
  const knowledge = payload.knowledge;
  if (knowledge && typeof knowledge === "object") {
    const id = (knowledge as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) {
      return id.trim();
    }
  }

  const fallback = payload.knowledge_id ?? payload.knowledgeId;
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback.trim();
  }

  return "";
};

async function fetchAccessToken() {
  if (!TOKEN_USERNAME || !TOKEN_PASSWORD || !TOKEN_CLIENT_SECRET) {
    throw new Error("Missing OAuth credentials");
  }

  const { data } = await axios.post(
    TOKEN_URL,
    {
      username: TOKEN_USERNAME,
      password: TOKEN_PASSWORD,
      grant_type: "password",
      scope: "*",
      client_id: TOKEN_CLIENT_ID,
      client_secret: TOKEN_CLIENT_SECRET,
    },
    { headers: { "Content-Type": "application/json" } },
  );

  const token = data?.access_token;
  if (!token) {
    throw new Error("No access token returned from OAuth");
  }

  return String(token);
}

const resolvePostsPayload = (data: unknown): ApiPost[] => {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;

  if (Array.isArray(record.data)) return record.data as ApiPost[];
  if (Array.isArray(record.posts)) return record.posts as ApiPost[];
  if (Array.isArray(data)) return data as ApiPost[];
  return [];
};

async function fetchPostsPage(
  apiUrl: string,
  token: string,
  params: Record<string, unknown>,
) {
  try {
    const { data } = await axios.get(apiUrl, {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    return resolvePostsPayload(data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      log("ERROR", "Posts fetch failed", {
        url: apiUrl,
        status: error.response?.status,
        statusText: error.response?.statusText,
        params,
      });
    } else {
      log("ERROR", "Posts fetch failed", { url: apiUrl, params });
    }

    throw error;
  }
}

const buildRawSourceText = (post: ApiPost) => {
  const parts = [
    post.title,
    post.introduction,
    post.description,
    post.video_transcript,
  ]
    .filter(Boolean)
    .map((value) => stripHtml(String(value)))
    .filter((value) => value.length > 0);

  if (parts.length === 0) return "";
  return parts.join("\n\n");
};

async function summarizePostWithLlm(rawSource: string, postId: number) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Source Material:\n\n${rawSource}` },
      ],
      temperature: 0.3,
    });

    const cleanedRaw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!cleanedRaw) return "";

    const cleaned = normalizeKnowledgeText(cleanedRaw);
    if (!cleaned) return "";

    if (cleaned.length > trainingLimits.maxSummarizedPostChars) {
      log("WARN", "Post skipped: summarized text too large", {
        postId,
        summarizedChars: cleaned.length,
      });
      return "";
    }

    return cleaned;
  } catch (error) {
    log("ERROR", "GPT processing failed", {
      postId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

const buildProcessedPostBlock = (post: ApiPost, cleanedText: string) => {
  const normalizedText = normalizeKnowledgeText(cleanedText);
  return [
    "# DOCUMENT TYPE: <JOURNAL_RECORD>",
    `--- START (ID: ${post.id}) ---`,
    normalizedText,
    "--- END ---",
    "",
  ].join("\n");
};

const inferBlogCategoryIdsForAgent = (agent: {
  slug: string | null;
  displayName: string;
  roleDescription: string | null;
}) => {
  const haystack =
    `${agent.slug ?? ""} ${agent.displayName} ${agent.roleDescription ?? ""}`
      .toLowerCase()
      .trim();
  if (!haystack) return [] as number[];

  const inferred = defaultBlogCategoryCatalog
    .filter((category) => {
      if (haystack.includes(category.key)) return true;
      if (haystack.includes(category.title.toLowerCase())) return true;
      if (category.key === "touristy") {
        return haystack.includes("travel") || haystack.includes("tour");
      }
      return false;
    })
    .map((category) => category.categoryId);

  return Array.from(new Set(inferred));
};

const resolveBlogCategoryIdsForAgent = async (agent: {
  id: string;
  slug: string | null;
  displayName: string;
  roleDescription: string | null;
  blogCategoryIds: number[];
  fallbackCategoryId?: number;
}) => {
  const configured = normalizeTrainingCategoryIds(agent.blogCategoryIds ?? []);
  if (configured.length > 0) {
    return configured;
  }

  const inferred = inferBlogCategoryIdsForAgent(agent);
  if (inferred.length > 0) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { blogCategoryIds: inferred },
    });

    log("INFO", "Agent categories inferred from role metadata", {
      agentId: agent.id,
      categoryIds: inferred,
    });
    return inferred;
  }

  if (
    typeof agent.fallbackCategoryId === "number" &&
    agent.fallbackCategoryId > 0
  ) {
    const fallback = [agent.fallbackCategoryId];
    await prisma.agent.update({
      where: { id: agent.id },
      data: { blogCategoryIds: fallback },
    });
    log("WARN", "Agent categories defaulted by sort order fallback", {
      agentId: agent.id,
      categoryIds: fallback,
    });
    return fallback;
  }

  return [];
};

const ensureAgentKnowledgeBaseId = async (agent: {
  id: string;
  agentId: string | null;
  displayName: string;
  knowledgeBaseId: string | null;
}) => {
  const localKnowledgeBaseId = agent.knowledgeBaseId?.trim();
  if (localKnowledgeBaseId) return localKnowledgeBaseId;

  if (!agent.agentId) {
    throw new Error(`Agent ${agent.id} does not have D-ID agent id`);
  }

  const didAgentRaw = await didService.getAgent(agent.agentId);
  const didAgent =
    didAgentRaw && typeof didAgentRaw === "object"
      ? (didAgentRaw as Record<string, unknown>)
      : null;

  const remoteKnowledgeBaseId = didAgent
    ? extractKnowledgeBaseId(didAgent)
    : "";
  if (remoteKnowledgeBaseId) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { knowledgeBaseId: remoteKnowledgeBaseId },
    });
    return remoteKnowledgeBaseId;
  }

  const createdKnowledgeBase = await didService.createKnowledgeBase({
    name: `${agent.displayName} knowledge`,
  });

  const createdKnowledgeBaseId = String(
    (createdKnowledgeBase as Record<string, unknown>)?.id ??
      (createdKnowledgeBase as Record<string, unknown>)?.knowledge_id ??
      (createdKnowledgeBase as Record<string, unknown>)?.knowledgeId ??
      "",
  ).trim();

  if (!createdKnowledgeBaseId) {
    throw new Error(`Failed to create knowledge base for agent ${agent.id}`);
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: { knowledgeBaseId: createdKnowledgeBaseId },
  });

  await didService.updateAgent(agent.agentId, {
    knowledge: { id: createdKnowledgeBaseId },
  });

  return createdKnowledgeBaseId;
};

const normalizeDidDocumentId = (value: string) =>
  value.includes("#") ? (value.split("#").pop() ?? value) : value;

const knowledgeUploadRoot = path.join(
  process.cwd(),
  "public",
  "uploads",
  "knowledge",
);
const knowledgeUploadRootPrefix = path.normalize(
  `${knowledgeUploadRoot}${path.sep}`,
);

const resolveStoredKnowledgeFilePath = (documentUrl?: string | null) => {
  if (!documentUrl) return null;
  const marker = "/uploads/knowledge/";
  const markerIndex = documentUrl.indexOf(marker);
  if (markerIndex < 0) return null;

  const relativePath = documentUrl.slice(markerIndex + 1);
  const absolutePath = path.normalize(
    path.join(process.cwd(), "public", relativePath),
  );
  if (!absolutePath.startsWith(knowledgeUploadRootPrefix)) {
    return null;
  }
  return absolutePath;
};

const buildTextBlogBuckets = (
  posts: { id: string; content: string; charCount: number }[],
) => {
  const buckets: { content: string; postIds: string[] }[] = [];
  const maxDocs = trainingLimits.maxBlogKnowledgeDocuments;
  const maxChars = trainingLimits.knowledgeBucketCharLimit;

  let currentParts: string[] = [];
  let currentPostIds: string[] = [];
  let currentChars = 0;

  for (const post of posts) {
    if (post.charCount <= 0 || !post.content.trim()) continue;
    if (post.charCount > maxChars) continue;

    if (currentChars > 0 && currentChars + post.charCount > maxChars) {
      buckets.push({
        content: currentParts.join("\n"),
        postIds: currentPostIds,
      });
      currentParts = [];
      currentPostIds = [];
      currentChars = 0;

      if (buckets.length >= maxDocs) {
        break;
      }
    }

    currentParts.push(post.content);
    currentPostIds.push(post.id);
    currentChars += post.charCount;
  }

  if (currentPostIds.length > 0 && buckets.length < maxDocs) {
    buckets.push({
      content: currentParts.join("\n"),
      postIds: currentPostIds,
    });
  }

  return buckets;
};

const syncTextBlogPartDocument = async (input: {
  agentId: string;
  knowledgeBaseId: string;
  partNumber: number;
  content: string;
  existingDocument: {
    id: string;
    documentId: string | null;
    documentUrl: string | null;
  } | null;
}) => {
  await mkdir(knowledgeUploadRoot, { recursive: true });

  if (input.existingDocument?.documentUrl) {
    const previousPath = resolveStoredKnowledgeFilePath(
      input.existingDocument.documentUrl,
    );
    if (previousPath) {
      await unlink(previousPath).catch(() => undefined);
    }
  }

  const fileName = `knowledge-${input.agentId}-part-${input.partNumber}-${Date.now()}.txt`;
  const filePath = path.join(knowledgeUploadRoot, fileName);
  await writeFile(filePath, input.content, "utf8");

  const publicUrl = `${APP_BASE_URL}/uploads/knowledge/${fileName}`;
  const baseUrl = await resolveBaseUrl();
  const webhookUrl = `${baseUrl}/api/webhooks/did/knowledge`;
  const title = `Text Blog (Part #${input.partNumber})`;

  if (input.existingDocument?.documentId) {
    await didService
      .deleteKnowledgeDocument(
        input.knowledgeBaseId,
        input.existingDocument.documentId,
      )
      .catch(() => undefined);
  }

  const created = await didService.createKnowledgeDocument(
    input.knowledgeBaseId,
    {
      documentType: "text",
      source_url: publicUrl,
      title,
      webhook: webhookUrl,
    },
  );

  const didDocumentId = String(
    (created as Record<string, unknown>)?.id ??
      (created as Record<string, unknown>)?.document_id ??
      (created as Record<string, unknown>)?.documentId ??
      "",
  ).trim();

  if (!didDocumentId) {
    throw new Error(
      `D-ID did not return document id for blog part #${input.partNumber}`,
    );
  }

  if (input.existingDocument) {
    return prisma.knowledgeDocuments.update({
      where: { id: input.existingDocument.id },
      data: {
        source: trainingSourceLabels.textBlog,
        categoryId: null,
        title,
        documentId: didDocumentId,
        documentUrl: publicUrl,
        status: "PROCESSING",
        isEnabled: true,
        charCount: input.content.length,
        isFull: input.content.length >= trainingLimits.knowledgeBucketCharLimit,
      },
      select: { id: true },
    });
  }

  return prisma.knowledgeDocuments.create({
    data: {
      agentId: input.agentId,
      source: trainingSourceLabels.textBlog,
      categoryId: null,
      title,
      documentId: didDocumentId,
      documentUrl: publicUrl,
      status: "PROCESSING",
      isEnabled: true,
      charCount: input.content.length,
      isFull: input.content.length >= trainingLimits.knowledgeBucketCharLimit,
    },
    select: { id: true },
  });
};

const syncTextBlogDocumentsForAgent = async (input: {
  agent: { id: string; displayName: string };
  knowledgeBaseId: string;
  categoryIds: number[];
}) => {
  const documents = await prisma.knowledgeDocuments.findMany({
    where: {
      agentId: input.agent.id,
      source: { equals: trainingSourceLabels.textBlog, mode: "insensitive" },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      documentId: true,
      documentUrl: true,
      isEnabled: true,
    },
  });

  const disabledDocIds = documents
    .filter((doc) => !doc.isEnabled)
    .map((doc) => doc.id);
  const enabledDocs = documents.filter((doc) => doc.isEnabled);

  const postsRaw = await prisma.processedPost.findMany({
    where: {
      agentId: input.agent.id,
      categoryId: { in: input.categoryIds },
      charCount: { gt: 0 },
      ...(disabledDocIds.length > 0
        ? { NOT: { knowledgeDocumentId: { in: disabledDocIds } } }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      content: true,
      charCount: true,
    },
  });

  const posts = postsRaw
    .map((post) => {
      const normalizedContent = normalizeKnowledgeText(post.content);
      return {
        ...post,
        content: normalizedContent,
        charCount: normalizedContent.length,
      };
    })
    .filter((post) => post.charCount > 0);

  const buckets = buildTextBlogBuckets(posts);
  const activeDocs = enabledDocs.slice(
    0,
    trainingLimits.maxBlogKnowledgeDocuments,
  );
  const staleEnabledDocs = enabledDocs.slice(
    trainingLimits.maxBlogKnowledgeDocuments,
  );
  const syncedDocs: { id: string; postIds: string[] }[] = [];

  for (const [index, bucket] of buckets.entries()) {
    const existingDoc = activeDocs[index] ?? null;
    const syncedDoc = await syncTextBlogPartDocument({
      agentId: input.agent.id,
      knowledgeBaseId: input.knowledgeBaseId,
      partNumber: index + 1,
      content: bucket.content,
      existingDocument: existingDoc
        ? {
            id: existingDoc.id,
            documentId: existingDoc.documentId,
            documentUrl: existingDoc.documentUrl,
          }
        : null,
    });
    syncedDocs.push({ id: syncedDoc.id, postIds: bucket.postIds });
  }

  const docsToRemove = [
    ...activeDocs.slice(buckets.length),
    ...staleEnabledDocs,
  ];
  const docsToRemoveIds = docsToRemove.map((doc) => doc.id);

  if (docsToRemoveIds.length > 0) {
    await prisma.processedPost.updateMany({
      where: { knowledgeDocumentId: { in: docsToRemoveIds } },
      data: { knowledgeDocumentId: null },
    });

    for (const doc of docsToRemove) {
      if (doc.documentId) {
        await didService
          .deleteKnowledgeDocument(
            input.knowledgeBaseId,
            normalizeDidDocumentId(doc.documentId),
          )
          .catch(() => undefined);
      }
      const localPath = resolveStoredKnowledgeFilePath(doc.documentUrl);
      if (localPath) {
        await unlink(localPath).catch(() => undefined);
      }
    }

    await prisma.knowledgeDocuments.deleteMany({
      where: { id: { in: docsToRemoveIds } },
    });
  }

  const candidatePostIds = posts.map((post) => post.id);
  const assignedPostIds = new Set(syncedDocs.flatMap((doc) => doc.postIds));
  const activeDocIds = activeDocs.map((doc) => doc.id);

  if (activeDocIds.length > 0) {
    await prisma.processedPost.updateMany({
      where: {
        knowledgeDocumentId: { in: activeDocIds },
        OR: [
          { categoryId: { notIn: input.categoryIds } },
          { charCount: { lte: 0 } },
        ],
      },
      data: { knowledgeDocumentId: null },
    });
  }

  for (const doc of syncedDocs) {
    await prisma.processedPost.updateMany({
      where: { id: { in: doc.postIds } },
      data: { knowledgeDocumentId: doc.id },
    });
  }

  const unassignedPostIds = candidatePostIds.filter(
    (id) => !assignedPostIds.has(id),
  );
  if (unassignedPostIds.length > 0) {
    await prisma.processedPost.updateMany({
      where: { id: { in: unassignedPostIds } },
      data: { knowledgeDocumentId: null },
    });
  }

  log("INFO", "Text blog document sync completed", {
    agentId: input.agent.id,
    categoryIds: input.categoryIds,
    sourcePosts: posts.length,
    activeDocuments: syncedDocs.length,
  });
};

const syncSingleCategoryForAgent = async (input: {
  agent: {
    id: string;
    displayName: string;
  };
  apiUrl: string;
  token: string;
  categoryId: number;
  categoryTitle: string;
}) => {
  log("INFO", "Category sync started", {
    agentId: input.agent.id,
    categoryId: input.categoryId,
    categoryTitle: input.categoryTitle,
  });

  const newPosts: ApiPost[] = [];
  let page = 1;
  let keepFetching = true;

  while (keepFetching) {
    const posts = await fetchPostsPage(input.apiUrl, input.token, {
      category: input.categoryId,
      page,
      limit: API_PAGE_LIMIT,
      sort: "date",
      direction: "desc",
      status: 1,
    });

    if (!posts || posts.length === 0) {
      break;
    }

    for (const post of posts) {
      const existing = await prisma.processedPost.findUnique({
        where: {
          agentId_externalId_categoryId: {
            agentId: input.agent.id,
            externalId: String(post.id),
            categoryId: input.categoryId,
          },
        },
        select: { id: true },
      });

      if (existing) {
        keepFetching = false;
        break;
      }

      if (!newPosts.some((entry) => entry.id === post.id)) {
        newPosts.push(post);
      }
    }

    if (posts.length < API_PAGE_LIMIT) {
      keepFetching = false;
      break;
    }

    page += 1;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  newPosts.sort(
    (a, b) =>
      new Date(resolvePostDate(a)).getTime() -
      new Date(resolvePostDate(b)).getTime(),
  );

  for (const post of newPosts) {
    const rawSource = buildRawSourceText(post);
    if (rawSource.length < trainingLimits.minRawPostChars) {
      await prisma.processedPost.upsert({
        where: {
          agentId_externalId_categoryId: {
            agentId: input.agent.id,
            externalId: String(post.id),
            categoryId: input.categoryId,
          },
        },
        update: {
          content: "",
          charCount: 0,
          knowledgeDocumentId: null,
        },
        create: {
          agentId: input.agent.id,
          categoryId: input.categoryId,
          externalId: String(post.id),
          content: "",
          charCount: 0,
          knowledgeDocumentId: null,
        },
      });
      continue;
    }

    const summarized = await summarizePostWithLlm(rawSource, post.id);
    if (!summarized) {
      await prisma.processedPost.upsert({
        where: {
          agentId_externalId_categoryId: {
            agentId: input.agent.id,
            externalId: String(post.id),
            categoryId: input.categoryId,
          },
        },
        update: {
          content: "",
          charCount: 0,
          knowledgeDocumentId: null,
        },
        create: {
          agentId: input.agent.id,
          categoryId: input.categoryId,
          externalId: String(post.id),
          content: "",
          charCount: 0,
          knowledgeDocumentId: null,
        },
      });
      continue;
    }

    const block = buildProcessedPostBlock(post, summarized);
    const blockCharCount = block.length;

    await prisma.processedPost.upsert({
      where: {
        agentId_externalId_categoryId: {
          agentId: input.agent.id,
          externalId: String(post.id),
          categoryId: input.categoryId,
        },
      },
      update: {
        content: block,
        charCount: blockCharCount,
      },
      create: {
        agentId: input.agent.id,
        categoryId: input.categoryId,
        externalId: String(post.id),
        content: block,
        charCount: blockCharCount,
      },
    });
  }

  log("INFO", "Category sync completed", {
    agentId: input.agent.id,
    categoryId: input.categoryId,
    categoryTitle: input.categoryTitle,
    newPosts: newPosts.length,
  });
};

const worker = new Worker(
  "knowledge-sync-queue",
  async (job) => {
    const startedAt = Date.now();

    try {
      const apiUrl =
        String(job.data?.apiUrl ?? "").trim() ||
        process.env.DOND_POSTS_URL ||
        "https://www.dondemineilstravels.com/api/v2/posts";

      const token = await fetchAccessToken();

      const agents = await prisma.agent.findMany({
        select: {
          id: true,
          slug: true,
          agentId: true,
          displayName: true,
          roleDescription: true,
          knowledgeBaseId: true,
          blogCategoryIds: true,
          blogKnowledgeEnabled: true,
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });

      if (agents.length === 0) {
        log("WARN", "No agents found for knowledge sync");
        return;
      }

      for (const [agentIndex, agent] of agents.entries()) {
        if (!agent.blogKnowledgeEnabled) {
          log("INFO", "Text blog sync skipped for agent (disabled)", {
            agentId: agent.id,
          });
          continue;
        }

        const knowledgeBaseId = await ensureAgentKnowledgeBaseId(agent);
        const fallbackCategoryId =
          defaultBlogCategoryCatalog[agentIndex]?.categoryId ?? undefined;
        const categoryIds = await resolveBlogCategoryIdsForAgent({
          ...agent,
          fallbackCategoryId,
        });
        if (categoryIds.length === 0) {
          log("WARN", "Text blog sync skipped: no categories configured", {
            agentId: agent.id,
          });
          continue;
        }

        for (const categoryId of categoryIds) {
          await syncSingleCategoryForAgent({
            agent,
            apiUrl,
            token,
            categoryId,
            categoryTitle:
              resolveBlogCategoryTitle(categoryId) || `Category ${categoryId}`,
          });
        }

        await syncTextBlogDocumentsForAgent({
          agent,
          knowledgeBaseId,
          categoryIds,
        });
      }

      log("INFO", "Sync complete", {
        jobId: job.id,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      log("ERROR", "Sync job failed", {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
  {
    connection: { url: REDIS_URL },
    concurrency: 1,
    lockDuration: 7200000,
  },
);

worker.on("completed", (job) => {
  log("INFO", "Job completed", { jobId: job.id });
});

worker.on("failed", (job, error) => {
  log("ERROR", "Job failed", {
    jobId: job?.id,
    error: error.message,
  });
});
