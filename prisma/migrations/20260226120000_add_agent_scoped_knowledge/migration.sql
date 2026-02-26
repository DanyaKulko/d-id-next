ALTER TABLE "agents"
ADD COLUMN "knowledgeBaseId" TEXT;

ALTER TABLE "knowledge_bases"
ADD COLUMN "agentId" TEXT,
ADD COLUMN "categoryId" INTEGER;

ALTER TABLE "processed_posts"
ADD COLUMN "agentId" TEXT,
ADD COLUMN "categoryId" INTEGER;

DROP INDEX IF EXISTS "processed_posts_externalId_key";

CREATE UNIQUE INDEX "processed_posts_agentId_externalId_categoryId_key"
ON "processed_posts"("agentId", "externalId", "categoryId");

CREATE INDEX "processed_posts_agentId_categoryId_knowledgeDocumentId_idx"
ON "processed_posts"("agentId", "categoryId", "knowledgeDocumentId");

CREATE INDEX "knowledge_bases_agentId_source_isEnabled_idx"
ON "knowledge_bases"("agentId", "source", "isEnabled");

CREATE INDEX "knowledge_bases_agentId_categoryId_idx"
ON "knowledge_bases"("agentId", "categoryId");

ALTER TABLE "knowledge_bases"
ADD CONSTRAINT "knowledge_bases_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "processed_posts"
ADD CONSTRAINT "processed_posts_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
