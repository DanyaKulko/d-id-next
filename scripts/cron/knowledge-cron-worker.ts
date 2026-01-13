import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import OpenAI from 'openai';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import { didService } from '@/lib/services/did.service';

// --- CONFIG ---
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DID_KNOWLEDGE_BASE_ID = process.env.DID_KNOWLEDGE_BASE_ID;

const DOC_SOURCE_NAME = 'text blog';
const BUCKET_CHAR_LIMIT = 400000;
const API_PAGE_LIMIT = 50;

const SYSTEM_PROMPT = `
<goal>  
Process existing text for future AI model training. It is important that the text:  
— sounds like Neil’s direct speech (first person);  
— contains no noise, external context, or other people’s voices.  
</goal>

<response_format>
Response format:
— Clean Markdown.
— The text must be self-contained.
— Output only the final processed text.
</response_format>

<context>  
You are an editor processing data for an AI avatar of Neil Marathe.
</context>
`;

const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

interface ApiPost {
    id: number;
    title: string;
    introduction: string | null;
    description: string | null;
    video_transcript: string | null;
    created_at: string;
}

// --- ХЕЛПЕРЫ ---

async function cleanWithGPT(post: ApiPost): Promise<string> {
    const parts = [post.title, post.introduction, post.description, post.video_transcript]
        .filter(Boolean).join('\n\n');

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
        return `\n\n--- DOCUMENT START (ID: ${post.id}) ---\n${cleaned}\n--- DOCUMENT END ---\n`;
    } catch (e) {
        console.error(`[GPT Error] Post ${post.id}`, e);
        return '';
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
    console.log(`📤 Uploading Part #${partNumber} to D-ID. Size: ${fullContent.length}.`);

    try {
        if (dIdDocumentId) {
            console.log(`🗑 Deleting old D-ID doc: ${dIdDocumentId}`);
            await didService.deleteKnowledgeDocument(DID_KNOWLEDGE_BASE_ID!, dIdDocumentId)
                .catch(e => console.warn("Old doc delete skipped:", e.message));
        }

        const result = await didService.createKnowledgeDocument(DID_KNOWLEDGE_BASE_ID!, {
            documentType: "text",
            source_url: publicUrl,
            title: `Text Blog (Part #${partNumber})`,
        });

        const newDidId = (result as any)?.id || (result as any)?.documentId;

        let dbRecord: any;
        if (docId) {
            dbRecord = await prisma.knowledgeDocuments.update({
                where: { id: docId },
                data: {
                    source: DOC_SOURCE_NAME,
                    documentId: String(newDidId),
                    documentUrl: publicUrl,
                    status: 'READY',
                    charCount: fullContent.length,
                    updatedAt: new Date()
                }
            });
        } else {
            dbRecord = await prisma.knowledgeDocuments.create({
                data: {
                    source: DOC_SOURCE_NAME,
                    documentId: String(newDidId),
                    documentUrl: publicUrl,
                    status: 'READY',
                    charCount: fullContent.length
                }
            });
        }

        return dbRecord;
    } finally {
        setTimeout(() => unlink(filePath).catch(() => {}), 120000);
    }
}

// --- WORKER ---

const worker = new Worker('knowledge-sync-queue', async (job) => {
    console.log(`🚀 Sync Job Started`);
    const { apiUrl, categories } = job.data;

    if (!DID_KNOWLEDGE_BASE_ID) throw new Error("No D-ID Base ID");
    if (!categories || !Array.isArray(categories)) throw new Error("No categories provided");

    let allNewPosts: ApiPost[] = [];

    for (const catId of categories) {
        console.log(`🔎 Scanning Category ID: ${catId}`);
        let page = 1;
        let keepFetchingCategory = true;

        while (keepFetchingCategory) {
            const url = `${apiUrl}?category=${catId}&page=${page}&limit=${API_PAGE_LIMIT}&sort=created_at&direction=desc`;

            try {
                const { data } = await axios.get(url);
                const posts = data.data;

                if (!posts || posts.length === 0) {
                    keepFetchingCategory = false;
                    break;
                }

                for (const post of posts) {
                    const exists = await prisma.processedPost.findUnique({
                        where: { externalId: String(post.id) }
                    });

                    if (exists) {
                        console.log(`🛑 Found known post ${post.id} in Cat ${catId}. Stopping category fetch.`);
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
                console.error(`Error fetching category ${catId} page ${page}:`, e);
                keepFetchingCategory = false;
            }
        }
    }

    if (allNewPosts.length === 0) {
        console.log("✅ No new posts in any category.");
        return;
    }

    console.log(`Sorting ${allNewPosts.length} collected posts...`);

    allNewPosts.sort((a, b) => {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    let currentDoc = await prisma.knowledgeDocuments.findFirst({
        where: { isFull: false, source: DOC_SOURCE_NAME },
        orderBy: { createdAt: 'desc' },
        include: { posts: { orderBy: { createdAt: 'asc' } } }
    });

    const totalDocsCount = await prisma.knowledgeDocuments.count({
        where: { source: DOC_SOURCE_NAME }
    });

    let currentPartNumber = currentDoc ? totalDocsCount : totalDocsCount + 1;

    let currentDocContent = currentDoc ? currentDoc.posts.map(p => p.content).join("") : "";
    let currentDocCharCount = currentDoc ? currentDoc.charCount : 0;

    let pendingPosts: { externalId: string, content: string, charCount: number }[] = [];


    for (const post of allNewPosts) {
        console.log(`Processing Post ${post.id}...`);
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

        // Лимит
        if ((currentDocCharCount + postLen) > BUCKET_CHAR_LIMIT) {

            if (currentDoc || pendingPosts.length > 0) {
                await finalizeDocument(currentDoc, pendingPosts, currentDocContent, currentPartNumber);
            }

            // Новый док
            currentDoc = null;
            currentDocContent = "";
            currentDocCharCount = 0;
            pendingPosts = [];
            currentPartNumber++;
        }

        pendingPosts.push({
            externalId: String(post.id),
            content: cleanText,
            charCount: postLen
        });
        currentDocContent += cleanText;
        currentDocCharCount += postLen;
    }

    // === ФАЗА 4: Остатки ===
    if (pendingPosts.length > 0) {
        await finalizeDocument(currentDoc, pendingPosts, currentDocContent, currentPartNumber);
    }

    console.log("✅ Sync Complete.");

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
    console.log(`💾 Finalizing Part #${partNumber}. Posts to add: ${newPosts.length}.`);

    const updatedDocRecord = await syncDocumentToDid(
        currentDoc?.id || null,
        currentDoc?.documentId || null,
        fullContent,
        partNumber
    );

    // Transaction для сохранения постов
    await prisma.$transaction(
        newPosts.map(post =>
            prisma.processedPost.create({
                data: {
                    externalId: post.externalId,
                    content: post.content,
                    charCount: post.charCount,
                    knowledgeDocumentId: updatedDocRecord.id
                }
            })
        )
    );

    if (updatedDocRecord.charCount >= BUCKET_CHAR_LIMIT) {
        await prisma.knowledgeDocuments.update({
            where: { id: updatedDocRecord.id },
            data: { isFull: true }
        });
        console.log(`🔒 Document FULL.`);
    }
}
