import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parseStoredDocumentIds } from "@/lib/external-sources/documents";

export const runtime = "nodejs";

const resolvePayloadRecord = (
  value: unknown,
): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const mapStatus = (value?: string) => {
  switch ((value ?? "").toLowerCase()) {
    case "ready":
    case "completed":
    case "active":
    case "done":
      return "READY" as const;
    case "failed":
    case "error":
      return "FAILED" as const;
    default:
      return "PROCESSING" as const;
  }
};

const normalizeDidDocumentId = (value: string) =>
  value.includes("#") ? (value.split("#").pop() ?? value) : value;

const matchesDidDocumentId = (value: string, candidate: string) =>
  value === candidate ||
  normalizeDidDocumentId(value) === normalizeDidDocumentId(candidate);

const knownSources = new Map([
  ["manual training", "Manual training"],
  ["text blog", "Text blog"],
  ["video transcripts", "Video transcripts"],
]);

const manualTrainingDocKey = "manualTrainingDocId";
const manualTrainingSource = "Manual training";
const textBlogSource = "Text blog";
const videoTranscriptsSource = "Video transcripts";

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  console.log("raw", raw);
  const payload = resolvePayloadRecord(raw);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const record = resolvePayloadRecord(
    payload.document ?? payload.data ?? payload,
  );
  if (!record) {
    return NextResponse.json(
      { error: "Missing document payload" },
      { status: 400 },
    );
  }

  const documentId =
    record.document_id ??
    record.documentId ??
    record.id ??
    payload.document_id ??
    payload.documentId ??
    payload.id;

  if (!documentId) {
    return NextResponse.json({ error: "Missing document id" }, { status: 400 });
  }

  const title =
    record.title ??
    record.name ??
    record.source ??
    payload.title ??
    payload.name ??
    "Knowledge Document";

  const normalizedSource = String(title ?? "").trim();
  const sourceKey = normalizedSource.toLowerCase();
  const [manualDoc, externalSources] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: manualTrainingDocKey } }),
    prisma.externalSource.findMany(),
  ]);

  const textDoc = externalSources.find((item) => item.kind === "TEXT");
  const videoDoc = externalSources.find((item) => item.kind === "VIDEO");

  const knownDocMap = new Map<string, string>();
  if (manualDoc?.value) {
    knownDocMap.set(manualDoc.value, manualTrainingSource);
    knownDocMap.set(
      normalizeDidDocumentId(manualDoc.value),
      manualTrainingSource,
    );
  }
  for (const docId of parseStoredDocumentIds(textDoc?.documentId ?? null)) {
    knownDocMap.set(docId, textBlogSource);
    knownDocMap.set(normalizeDidDocumentId(docId), textBlogSource);
  }
  for (const docId of parseStoredDocumentIds(videoDoc?.documentId ?? null)) {
    knownDocMap.set(docId, videoTranscriptsSource);
    knownDocMap.set(normalizeDidDocumentId(docId), videoTranscriptsSource);
  }

  const expectedDocIdBySourceKey = new Map<string, string[]>();
  if (manualDoc?.value) {
    expectedDocIdBySourceKey.set(
      manualTrainingSource.toLowerCase(),
      [manualDoc.value],
    );
  }
  if (textDoc?.documentId) {
    expectedDocIdBySourceKey.set(
      textBlogSource.toLowerCase(),
      parseStoredDocumentIds(textDoc.documentId),
    );
  }
  if (videoDoc?.documentId) {
    expectedDocIdBySourceKey.set(
      videoTranscriptsSource.toLowerCase(),
      parseStoredDocumentIds(videoDoc.documentId),
    );
  }

  const canonicalSource =
    knownDocMap.get(String(documentId)) ??
    knownSources.get(sourceKey) ??
    normalizedSource;

  const expectedDocIds = expectedDocIdBySourceKey.get(sourceKey);
  if (expectedDocIds && expectedDocIds.length > 0) {
    const matches = expectedDocIds.some((docId) =>
      matchesDidDocumentId(String(documentId), docId),
    );
    if (!matches) {
      return NextResponse.json({ ok: true });
    }
  }

  const status = mapStatus((record.status ?? payload.status) as string);
  const documentUrl =
    record.document_url ??
    record.documentUrl ??
    record.url ??
    record.source_url ??
    payload.document_url ??
    payload.documentUrl ??
    payload.url ??
    payload.source_url;

  const existing = await prisma.knowledgeDocuments.findFirst({
    where: { documentId: String(documentId) },
  });

  const existingBySource =
    !existing && knownSources.has(sourceKey)
      ? await prisma.knowledgeDocuments.findFirst({
          where: { source: canonicalSource },
        })
      : null;

  if (existing) {
    await prisma.knowledgeDocuments.update({
      where: { id: existing.id },
      data: {
        status,
        documentUrl:
          typeof documentUrl === "string" ? documentUrl : existing.documentUrl,
      },
    });
  } else if (existingBySource) {
    await prisma.knowledgeDocuments.update({
      where: { id: existingBySource.id },
      data: {
        documentId: String(documentId),
        status,
        documentUrl:
          typeof documentUrl === "string"
            ? documentUrl
            : existingBySource.documentUrl,
        source: canonicalSource,
      },
    });
  } else {
    await prisma.knowledgeDocuments.create({
      data: {
        source: canonicalSource || "Knowledge Document",
        documentId: String(documentId),
        documentUrl: typeof documentUrl === "string" ? documentUrl : null,
        status,
      },
    });
  }

  if (knownSources.has(sourceKey)) {
    await prisma.knowledgeDocuments.deleteMany({
      where: {
        source: { equals: canonicalSource, mode: "insensitive" },
        documentId: { not: String(documentId) },
      },
    });
  }

  return NextResponse.json({ ok: true });
}
