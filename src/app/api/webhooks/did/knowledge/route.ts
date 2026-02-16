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

const resolveDocumentUrl = (
  incoming: unknown,
  current: string | null,
): string | null => {
  if (typeof incoming !== "string") return current;
  const trimmed = incoming.trim();
  if (!trimmed) return current;
  if (trimmed.startsWith("s3://")) {
    return current;
  }
  return trimmed;
};

const resolveDocumentTitle = (
  incoming: unknown,
  current: string | null,
  source: string,
) => {
  if (typeof incoming === "string" && incoming.trim()) {
    return incoming.trim();
  }
  if (current?.trim()) {
    return current.trim();
  }
  if (source.trim()) {
    return source.trim();
  }
  return "Knowledge Document";
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
  const incomingDocumentId = String(documentId);
  const normalizedIncomingDocumentId =
    normalizeDidDocumentId(incomingDocumentId);

  const title = record.title ?? record.name ?? payload.title ?? payload.name;
  const normalizedTitle = String(title ?? "").trim();
  const sourceLabelRaw = record.source ?? payload.source;
  const normalizedSourceLabel = String(sourceLabelRaw ?? "").trim();
  const sourceKey = (
    normalizedSourceLabel ||
    normalizedTitle ||
    "Knowledge"
  ).toLowerCase();
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
    expectedDocIdBySourceKey.set(manualTrainingSource.toLowerCase(), [
      manualDoc.value,
    ]);
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

  const trackedSourceById =
    knownDocMap.get(incomingDocumentId) ??
    knownDocMap.get(normalizedIncomingDocumentId);

  const expectedDocIds = expectedDocIdBySourceKey.get(sourceKey);
  if (expectedDocIds && expectedDocIds.length > 0) {
    const matches = expectedDocIds.some((docId) =>
      matchesDidDocumentId(incomingDocumentId, docId),
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

  const existingCandidates = await prisma.knowledgeDocuments.findMany({
    where: {
      OR: [
        { documentId: incomingDocumentId },
        { documentId: normalizedIncomingDocumentId },
        { documentId: { endsWith: `#${normalizedIncomingDocumentId}` } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });
  const existing =
    existingCandidates.find(
      (candidate) =>
        Boolean(candidate.documentUrl) &&
        !candidate.documentUrl?.startsWith("s3://"),
    ) ??
    existingCandidates[0] ??
    null;
  const storedDocumentId = normalizedIncomingDocumentId || incomingDocumentId;

  const existingBySource =
    !existing &&
    sourceKey === manualTrainingSource.toLowerCase() &&
    Boolean(manualDoc?.value)
      ? await prisma.knowledgeDocuments.findFirst({
          where: {
            source: { equals: manualTrainingSource, mode: "insensitive" },
          },
        })
      : null;
  const canonicalSource =
    knownSources.get(normalizedSourceLabel.toLowerCase()) ??
    knownSources.get(normalizedTitle.toLowerCase()) ??
    "";
  const resolvedSource =
    trackedSourceById ??
    existing?.source ??
    existingBySource?.source ??
    (canonicalSource || "Knowledge");

  if (existing && !existing.isEnabled) {
    return NextResponse.json({ ok: true });
  }
  if (existingBySource && !existingBySource.isEnabled) {
    return NextResponse.json({ ok: true });
  }
  if (!existing && !existingBySource && !trackedSourceById) {
    return NextResponse.json({ ok: true });
  }

  if (existing) {
    await prisma.knowledgeDocuments.update({
      where: { id: existing.id },
      data: {
        status,
        documentUrl: resolveDocumentUrl(documentUrl, existing.documentUrl),
        source: resolvedSource,
        title: resolveDocumentTitle(title, existing.title, resolvedSource),
      },
    });
  } else if (existingBySource) {
    await prisma.knowledgeDocuments.update({
      where: { id: existingBySource.id },
      data: {
        documentId: storedDocumentId,
        status,
        documentUrl: resolveDocumentUrl(
          documentUrl,
          existingBySource.documentUrl,
        ),
        source: resolvedSource,
        title: resolveDocumentTitle(
          title,
          existingBySource.title,
          resolvedSource,
        ),
      },
    });
  } else {
    await prisma.knowledgeDocuments.create({
      data: {
        source: resolvedSource,
        title: resolveDocumentTitle(title, null, resolvedSource),
        documentId: storedDocumentId,
        documentUrl: resolveDocumentUrl(documentUrl, null),
        status,
        isEnabled: true,
      },
    });
  }

  if (resolvedSource.toLowerCase() === manualTrainingSource.toLowerCase()) {
    await prisma.knowledgeDocuments.deleteMany({
      where: {
        source: { equals: manualTrainingSource, mode: "insensitive" },
        documentId: { not: storedDocumentId },
      },
    });
  }

  return NextResponse.json({ ok: true });
}
