import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

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

const resolveDocumentUrl = (
  incoming: unknown,
  current: string | null,
): string | null => {
  if (typeof incoming !== "string") return current;
  const trimmed = incoming.trim();
  if (!trimmed) return current;
  if (trimmed.startsWith("s3://")) return current;
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

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const payload = resolvePayloadRecord(raw);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const record = resolvePayloadRecord(payload.document ?? payload.data ?? payload);
  if (!record) {
    return NextResponse.json(
      { error: "Missing document payload" },
      { status: 400 },
    );
  }

  const incomingDocumentId = String(
    record.document_id ??
      record.documentId ??
      record.id ??
      payload.document_id ??
      payload.documentId ??
      payload.id ??
      "",
  ).trim();

  if (!incomingDocumentId) {
    return NextResponse.json({ error: "Missing document id" }, { status: 400 });
  }

  const normalizedIncomingDocumentId = normalizeDidDocumentId(incomingDocumentId);

  const localDocs = await prisma.knowledgeDocuments.findMany({
    where: {
      OR: [
        { documentId: incomingDocumentId },
        { documentId: normalizedIncomingDocumentId },
        { documentId: { endsWith: `#${normalizedIncomingDocumentId}` } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  const current = localDocs[0] ?? null;
  if (!current) {
    return NextResponse.json({ ok: true });
  }

  if (!current.isEnabled) {
    return NextResponse.json({ ok: true });
  }

  const title = record.title ?? record.name ?? payload.title ?? payload.name;
  const documentUrl =
    record.document_url ??
    record.documentUrl ??
    record.url ??
    record.source_url ??
    payload.document_url ??
    payload.documentUrl ??
    payload.url ??
    payload.source_url;

  const status = mapStatus((record.status ?? payload.status) as string);
  const nextDocumentUrl = resolveDocumentUrl(documentUrl, current.documentUrl);
  const nextTitle = resolveDocumentTitle(title, current.title, current.source);

  await prisma.knowledgeDocuments.updateMany({
    where: {
      OR: [
        { id: { in: localDocs.map((doc) => doc.id) } },
        { documentId: incomingDocumentId },
        { documentId: normalizedIncomingDocumentId },
        { documentId: { endsWith: `#${normalizedIncomingDocumentId}` } },
      ],
    },
    data: {
      status,
      documentUrl: nextDocumentUrl,
      title: nextTitle,
    },
  });

  return NextResponse.json({ ok: true });
}
