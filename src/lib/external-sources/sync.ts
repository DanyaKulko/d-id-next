import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { externalSourcesSeeds } from "@/lib/external-sources/config";
import { resolveBaseUrl } from "@/lib/http/base-url";
import { didService } from "@/lib/services/did.service";

const uploadRoot = path.join(
  process.cwd(),
  "public",
  "uploads",
  "external-sources",
);

type ExternalSourceEntry = {
  id: "text" | "video";
  kind: "TEXT" | "VIDEO";
  sourceLabel: string;
  link: string;
  accessKey: string;
  documentId: string | null;
  filePath: string | null;
  rowId?: string;
  cron: string;
};

const buildHeaders = (apiKey?: string) => {
  if (!apiKey) return {};
  return {
    Authorization: `Bearer ${apiKey}`,
    "x-api-key": apiKey,
  };
};

const writeSourceFile = async (id: "text" | "video", payload: string) => {
  await mkdir(uploadRoot, { recursive: true });
  const filename = `${id}-source-${Date.now()}-${randomUUID()}.txt`;
  const filePath = path.join(uploadRoot, filename);
  await writeFile(filePath, payload, "utf8");
  return {
    filePath,
    publicPath: `/uploads/external-sources/${filename}`,
  };
};

export async function syncExternalSources() {
  const knowledgeBaseId = process.env.DID_KNOWLEDGE_BASE_ID ?? "";
  if (!knowledgeBaseId) {
    throw new Error("DID_KNOWLEDGE_BASE_ID is missing");
  }

  const existingSources = await prisma.externalSource.findMany();
  const sourceMap = new Map(existingSources.map((item) => [item.kind, item]));
  const sources = externalSourcesSeeds.map((seed): ExternalSourceEntry => {
    const existing = sourceMap.get(seed.kind);
    const id = seed.kind === "TEXT" ? "text" : "video";
    return {
      id,
      kind: seed.kind,
      sourceLabel: existing?.label ?? seed.label,
      link: existing?.link ?? seed.link,
      cron: existing?.cron ?? seed.cron,
      accessKey: existing?.accessKey ?? "",
      documentId: existing?.documentId ?? null,
      filePath: existing?.filePath ?? null,
      rowId: existing?.id,
    };
  });

  const baseUrl = await resolveBaseUrl();
  const results: Record<string, { ok: boolean; error?: string }> = {};

  for (const source of sources) {
    try {
      const response = await fetch(source.link, {
        headers: buildHeaders(source.accessKey),
      });
      if (!response.ok) {
        throw new Error(`Fetch failed (${response.status})`);
      }

      const payload = await response.text();

      if (source.filePath) {
        await unlink(source.filePath).catch(() => undefined);
      }

      const { filePath, publicPath } = await writeSourceFile(
        source.id,
        payload,
      );
      await prisma.externalSource.upsert({
        where: { kind: source.kind },
        update: {
          label: source.sourceLabel,
          link: source.link,
          cron: source.cron,
          accessKey: source.accessKey,
          filePath,
        },
        create: {
          kind: source.kind,
          label: source.sourceLabel,
          link: source.link,
          cron: source.cron,
          accessKey: source.accessKey,
          filePath,
        },
      });
      if (source.documentId) {
        await didService
          .deleteKnowledgeDocument(knowledgeBaseId, source.documentId)
          .catch(() => undefined);
      }

      const webhookUrl = `${baseUrl}/api/webhooks/did/knowledge`;
      const created = await didService.createKnowledgeDocument(
        knowledgeBaseId,
        {
          documentType: "text",
          source_url: `${baseUrl}${publicPath}`,
          title: source.sourceLabel,
          webhook: webhookUrl,
        },
      );

      const docId =
        (created as Record<string, unknown>)?.id ??
        (created as Record<string, unknown>)?.document_id ??
        (created as Record<string, unknown>)?.documentId;

      if (docId) {
        await prisma.externalSource.upsert({
          where: { kind: source.kind },
          update: {
            label: source.sourceLabel,
            link: source.link,
            cron: source.cron,
            accessKey: source.accessKey,
            documentId: String(docId),
            filePath,
          },
          create: {
            kind: source.kind,
            label: source.sourceLabel,
            link: source.link,
            cron: source.cron,
            accessKey: source.accessKey,
            documentId: String(docId),
            filePath,
          },
        });

        await prisma.knowledgeDocuments.deleteMany({
          where: {
            source: { equals: source.sourceLabel, mode: "insensitive" },
          },
        });
        await prisma.knowledgeDocuments.create({
          data: {
            source: source.sourceLabel,
            documentId: String(docId),
            documentUrl: `${baseUrl}${publicPath}`,
            status: "PROCESSING",
          },
        });
      }

      results[source.id] = { ok: true };
    } catch (error) {
      results[source.id] = {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  return { ok: true, results };
}
