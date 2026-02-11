import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import OpenAI from 'openai';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import {
    normalizeDocumentId,
    serializeDocumentIds,
} from '@/lib/external-sources/documents';
import { didService } from '@/lib/services/did.service';
import {resolveBaseUrl} from "@/lib/http/base-url";

// --- CONFIG ---
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DID_KNOWLEDGE_BASE_ID = process.env.DID_KNOWLEDGE_BASE_ID;
const TOKEN_URL =
  process.env.DOND_OAUTH_URL ||
  'https://www.dondemineilstravels.com/oauth/token';
const TOKEN_USERNAME = process.env.DOND_OAUTH_USERNAME;
const TOKEN_PASSWORD = process.env.DOND_OAUTH_PASSWORD;
const TOKEN_CLIENT_ID = process.env.DOND_OAUTH_CLIENT_ID || '2';
const TOKEN_CLIENT_SECRET = process.env.DOND_OAUTH_CLIENT_SECRET;

const DOC_SOURCE_NAME = 'Text blog';
const BLOG_ENABLED_KEY = 'textBlogEnabled';
const BUCKET_CHAR_LIMIT = 470000;
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
— The final text must not exceed 2500 characters including spaces.
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

const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
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

const decodeHtmlEntities = (value: string) => {
    let text = value
        .replace(/Ђ™/g, "'")
        .replace(/â€™/g, "'")
        .replace(/Ã¢â‚¬â„¢/g, "'");

    text = text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&rsquo;/gi, "'")
        .replace(/&lsquo;/gi, "'")
        .replace(/&rdquo;/gi, '"')
        .replace(/&ldquo;/gi, '"')
        .replace(/&mdash;/gi, '--')
        .replace(/&ndash;/gi, '-');

    return text;
}

const normalizeTypography = (value: string) => {
    return value
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\u2013/g, "-")
        .replace(/\u2014/g, "--")
        .replace(/\u2026/g, "...");
};

const stripHtml = (value: string) => {
    if (!value) return '';
    const withoutTags = value.replace(/<[^>]+>/g, ' ');
    const decoded = decodeHtmlEntities(withoutTags);
    const normalized = normalizeTypography(decoded);
    return normalized.replace(/\s+/g, ' ').trim();
};

const resolvePostDate = (post: ApiPost) =>
    post.created_at || post.published_at || post.updated_at || new Date().toISOString();

const isTextBlogEnabled = async () => {
    const setting = await prisma.appSetting.findUnique({
        where: { key: BLOG_ENABLED_KEY },
    });
    if (!setting?.value) return true;
    return setting.value === "true";
};

async function fetchAccessToken() {
    if (!TOKEN_USERNAME || !TOKEN_PASSWORD || !TOKEN_CLIENT_SECRET) {
        throw new Error('Missing MALINI OAuth credentials');
    }
    const { data } = await axios.post(
        TOKEN_URL,
        {
            username: TOKEN_USERNAME,
            password: TOKEN_PASSWORD,
            grant_type: 'password',
            scope: '*',
            client_id: TOKEN_CLIENT_ID,
            client_secret: TOKEN_CLIENT_SECRET,
        },
        { headers: { 'Content-Type': 'application/json' } },
    );

    const token = data?.access_token;
    if (!token) {
        throw new Error('No access token returned from OAuth');
    }
    return String(token);
}

const resolvePostsPayload = (data: any): ApiPost[] => {
    if (!data) return [];
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.posts)) return data.posts;
    if (Array.isArray(data)) return data;
    return [];
};

async function fetchPostsPage(apiUrl: string, token: string, params: Record<string, unknown>) {
    try {
        const { data } = await axios.get(apiUrl, {
            params,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
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

async function cleanWithGPT(post: ApiPost): Promise<string> {
    const parts = [
        post.title,
        post.introduction,
        post.description,
        post.video_transcript,
    ]
        .filter(Boolean)
        .map((value) => stripHtml(String(value)))
        .filter((value) => value && value.length > 0)
        .join('\n\n');

    if (parts.length < 50) return '';

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Source Material:\n\n${parts}` }
            ],
            temperature: 0.3,
        });

        const cleaned = completion.choices[0]?.message?.content?.trim();
        if (!cleaned) return '';
        return `\n\n# DOCUMENT TYPE: <JOURNAL_RECORD>\n--- DOCUMENT START (ID: ${post.id}) ---\n${cleaned}\n--- DOCUMENT END ---\n`;
    } catch (e) {
        log("ERROR", "GPT processing failed", {
            postId: post.id,
            error: e instanceof Error ? e.message : String(e),
        });
        return '';
    }
}

async function updateTextSourceDocumentIds() {
    const documents = await prisma.knowledgeDocuments.findMany({
        where: { source: { equals: DOC_SOURCE_NAME, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
    });
    const docIds = documents
        .map((doc) => doc.documentId)
        .filter((docId): docId is string => Boolean(docId));
    await prisma.externalSource.updateMany({
        where: { kind: 'TEXT' },
        data: { documentId: serializeDocumentIds(docIds) },
    });
    return docIds;
}

async function reconcileTextBlogDocuments() {
    const localDocs = await prisma.knowledgeDocuments.findMany({
        where: { source: { equals: DOC_SOURCE_NAME, mode: 'insensitive' } },
        select: { id: true, documentId: true },
    });
    const localDocIds = localDocs.map((doc) => doc.id);

    const orphanCondition =
        localDocIds.length === 0
            ? { knowledgeDocumentId: { not: null } }
            : {
                  AND: [
                      { knowledgeDocumentId: { notIn: localDocIds } },
                      { knowledgeDocumentId: { not: null } },
                  ],
              };
    const orphaned = await prisma.processedPost.updateMany({
        where: orphanCondition,
        data: { knowledgeDocumentId: null },
    });
    if (orphaned.count > 0) {
        log("WARN", "Detached orphaned posts", { count: orphaned.count });
    }

    const docsWithoutDidId = localDocs
        .filter((doc) => !doc.documentId)
        .map((doc) => doc.id);
    if (docsWithoutDidId.length > 0) {
        await prisma.processedPost.updateMany({
            where: { knowledgeDocumentId: { in: docsWithoutDidId } },
            data: { knowledgeDocumentId: null },
        });
        await prisma.knowledgeDocuments.deleteMany({
            where: { id: { in: docsWithoutDidId } },
        });
        log("WARN", "Removed documents without D-ID ids", {
            count: docsWithoutDidId.length,
        });
    }

    let didDocumentIds: string[] = [];
    try {
        const didDocs = await didService.listKnowledgeDocuments(DID_KNOWLEDGE_BASE_ID!);
        didDocumentIds = (Array.isArray(didDocs) ? didDocs : [])
            .map((doc) => String((doc as any)?.id ?? (doc as any)?.document_id ?? (doc as any)?.documentId ?? ""))
            .filter((id) => id);
    } catch (error) {
        log("WARN", "D-ID document list failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        return;
    }

    const didSet = new Set([
        ...didDocumentIds,
        ...didDocumentIds.map((id) => normalizeDocumentId(id)),
    ]);

    const missingLocal = localDocs.filter((doc) => {
        if (!doc.documentId) return false;
        const normalized = normalizeDocumentId(doc.documentId);
        return !didSet.has(doc.documentId) && !didSet.has(normalized);
    });

    if (missingLocal.length > 0) {
        await prisma.processedPost.updateMany({
            where: { knowledgeDocumentId: { in: missingLocal.map((doc) => doc.id) } },
            data: { knowledgeDocumentId: null },
        });
        await prisma.knowledgeDocuments.deleteMany({
            where: { id: { in: missingLocal.map((doc) => doc.id) } },
        });
        log("WARN", "Local documents missing in D-ID; reset for reupload", {
            count: missingLocal.length,
        });
    }
}

async function syncDocumentToDid(
    docId: string | null,
    dIdDocumentId: string | null,
    fullContent: string,
    partNumber: number
) {
    const fileName = `knowledge-${Date.now()}.txt`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'knowledge');
    const filePath = path.join(uploadDir, fileName);

    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, fullContent, 'utf8');

    const publicUrl = `${APP_BASE_URL}/uploads/knowledge/${fileName}`;
    log("INFO", "Uploading document to D-ID", {
        partNumber,
        size: fullContent.length,
        existingDocId: dIdDocumentId ?? null,
    });

    try {
        if (dIdDocumentId) {
            log("INFO", "Deleting old D-ID document", { documentId: dIdDocumentId });
            await didService.deleteKnowledgeDocument(DID_KNOWLEDGE_BASE_ID!, dIdDocumentId)
                .catch(e => console.warn("Old doc delete skipped:", e.message));
        }

        const baseUrl = await resolveBaseUrl();

        const webhookUrl = `${baseUrl}/api/webhooks/did/knowledge`;

        const result = await didService.createKnowledgeDocument(DID_KNOWLEDGE_BASE_ID!, {
            documentType: "text",
            source_url: publicUrl,
            title: `Text Blog (Part #${partNumber})`,
            webhook: webhookUrl
        });

        const newDidId = (result as any)?.id || (result as any)?.documentId;
        const storedDidId = normalizeDocumentId(String(newDidId));

        let dbRecord: any;
        if (docId) {
            dbRecord = await prisma.knowledgeDocuments.update({
                where: { id: docId },
                data: {
                    source: DOC_SOURCE_NAME,
                    documentId: storedDidId,
                    documentUrl: publicUrl,
                    status: 'PROCESSING',
                    charCount: fullContent.length,
                    updatedAt: new Date()
                }
            });
        } else {
            dbRecord = await prisma.knowledgeDocuments.create({
                data: {
                    source: DOC_SOURCE_NAME,
                    documentId: storedDidId,
                    documentUrl: publicUrl,
                    status: 'PROCESSING',
                    charCount: fullContent.length
                }
            });
        }

        log("INFO", "D-ID document synced", {
            partNumber,
            documentId: newDidId,
            charCount: fullContent.length,
        });
        return dbRecord;
    } finally {
        // setTimeout(() => unlink(filePath).catch(() => {}), 120000);
    }
}

// --- WORKER ---

const worker = new Worker('knowledge-sync-queue', async (job) => {
    const startedAt = Date.now();
    try {
        log("INFO", "Sync job started", { jobId: job.id });
        const { apiUrl, categories } = job.data;

        const blogEnabled = await isTextBlogEnabled();
        if (!blogEnabled) {
            log("INFO", "Text blog knowledge disabled; skipping sync", {
                jobId: job.id,
            });
            return;
        }

        if (!DID_KNOWLEDGE_BASE_ID) throw new Error("No D-ID Base ID");
        if (!categories || !Array.isArray(categories)) throw new Error("No categories provided");

        await reconcileTextBlogDocuments();

        const resolvedApiUrl =
            apiUrl || process.env.DOND_POSTS_URL || 'https://www.dondemineilstravels.com/api/v2/posts';
        let accessToken = "";
        try {
            accessToken = await fetchAccessToken();
        } catch (error) {
            log("ERROR", "OAuth token fetch failed", {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }

        let allNewPosts: ApiPost[] = [];

        for (const catId of categories) {
            log("INFO", "Scanning category", { categoryId: catId });
            let page = 1;
            let keepFetchingCategory = true;

            while (keepFetchingCategory) {
                try {
                    const posts = await fetchPostsPage(resolvedApiUrl, accessToken, {
                        category: catId,
                        page,
                        limit: API_PAGE_LIMIT,
                        sort: 'date',
                        direction: 'desc',
                        status: 1,
                    });

                    if (!posts || posts.length === 0) {
                        keepFetchingCategory = false;
                        break;
                    }

                    for (const post of posts) {
                        const exists = await prisma.processedPost.findUnique({
                            where: { externalId: String(post.id) }
                        });

                        if (exists) {
                            log("INFO", "Known post found; stopping category scan", {
                                postId: post.id,
                                categoryId: catId,
                            });
                            keepFetchingCategory = false;
                            break;
                        }

                        const alreadyInBuffer = allNewPosts.find(p => p.id === post.id);
                        if (!alreadyInBuffer) {
                            allNewPosts.push(post);
                        }
                    }

                    if (posts.length < API_PAGE_LIMIT) keepFetchingCategory = false;
                    page++;
                    await new Promise(r => setTimeout(r, 5000));

                } catch (e) {
                    log("ERROR", "Category fetch failed", {
                        categoryId: catId,
                        page,
                        error: e instanceof Error ? e.message : String(e),
                    });
                    keepFetchingCategory = false;
                }
            }
        }

        if (allNewPosts.length > 0) {
            log("INFO", "Sorting new posts", { count: allNewPosts.length });

            allNewPosts.sort((a, b) => {
                return new Date(resolvePostDate(a)).getTime() - new Date(resolvePostDate(b)).getTime();
            });

            for (const post of allNewPosts) {
                log("INFO", "Processing post", { postId: post.id });
                const cleanText = await cleanWithGPT(post);

                if (!cleanText) {
                    await prisma.processedPost.create({
                        data: {
                            externalId: String(post.id),
                            content: "",
                            charCount: 0,
                        }
                    }).catch(() => {});
                    continue;
                }

                const postLen = cleanText.length;

                await prisma.processedPost.upsert({
                    where: { externalId: String(post.id) },
                    update: { content: cleanText, charCount: postLen },
                    create: {
                        externalId: String(post.id),
                        content: cleanText,
                        charCount: postLen,
                    },
                }).catch(() => {});
            }
        }

        const pendingPosts = await prisma.processedPost.findMany({
            where: {
                knowledgeDocumentId: null,
                charCount: { gt: 0 },
            },
            orderBy: { createdAt: 'asc' },
        });

        if (pendingPosts.length === 0) {
            log("INFO", "No new posts to process");
            await updateTextSourceDocumentIds();
            return;
        }

        let currentDoc = await prisma.knowledgeDocuments.findFirst({
            where: {
                isFull: false,
                source: { equals: DOC_SOURCE_NAME, mode: 'insensitive' },
            },
            orderBy: { createdAt: 'desc' },
            include: { posts: { orderBy: { createdAt: 'asc' } } }
        });

        const totalDocsCount = await prisma.knowledgeDocuments.count({
            where: { source: { equals: DOC_SOURCE_NAME, mode: 'insensitive' } }
        });

        let currentPartNumber = currentDoc ? totalDocsCount : totalDocsCount + 1;

        let currentDocContent = currentDoc ? currentDoc.posts.map(p => p.content).join("") : "";
        let currentDocCharCount = currentDocContent.length;
        let bufferedPosts: { externalId: string, content: string, charCount: number }[] = [];

        for (const post of pendingPosts) {
            const postLen = post.charCount || post.content.length;

            if ((currentDocCharCount + postLen) > BUCKET_CHAR_LIMIT) {
                if (bufferedPosts.length > 0) {
                    await finalizeDocument(currentDoc, bufferedPosts, currentDocContent, currentPartNumber);
                }

                currentDoc = null;
                currentDocContent = "";
                currentDocCharCount = 0;
                bufferedPosts = [];
                currentPartNumber++;
            }

            bufferedPosts.push({
                externalId: post.externalId,
                content: post.content,
                charCount: postLen,
            });
            currentDocContent += post.content;
            currentDocCharCount += postLen;
        }

        if (bufferedPosts.length > 0) {
            await finalizeDocument(currentDoc, bufferedPosts, currentDocContent, currentPartNumber);
        }

        await updateTextSourceDocumentIds();

        log("INFO", "Sync complete", { durationMs: Date.now() - startedAt });
    } catch (error) {
        log("ERROR", "Sync job failed", {
            jobId: job.id,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}, {
    connection: redis as any,
    concurrency: 1,
    lockDuration: 7200000 // 2 часа (так как категорий 4, может быть дольше)
});

async function finalizeDocument(
    currentDoc: any,
    newPosts: { externalId: string, content: string, charCount: number }[],
    fullContent: string,
    partNumber: number
) {
    log("INFO", "Finalizing document", {
        partNumber,
        posts: newPosts.length,
        existingDocId: currentDoc?.documentId ?? null,
    });

    const updatedDocRecord = await syncDocumentToDid(
        currentDoc?.id || null,
        currentDoc?.documentId || null,
        fullContent,
        partNumber
    );

    const externalIds = newPosts.map((post) => post.externalId);
    await prisma.processedPost.updateMany({
        where: { externalId: { in: externalIds } },
        data: { knowledgeDocumentId: updatedDocRecord.id },
    });

    if (updatedDocRecord.charCount >= BUCKET_CHAR_LIMIT) {
        await prisma.knowledgeDocuments.update({
            where: { id: updatedDocRecord.id },
            data: { isFull: true }
        });
        log("WARN", "Document marked FULL", { documentId: updatedDocRecord.id });
    }
}
