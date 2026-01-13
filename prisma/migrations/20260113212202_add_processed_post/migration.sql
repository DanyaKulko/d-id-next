-- AlterTable
ALTER TABLE "knowledge_bases" ADD COLUMN     "charCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isFull" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "processed_posts" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "knowledgeDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_posts_externalId_key" ON "processed_posts"("externalId");

-- AddForeignKey
ALTER TABLE "processed_posts" ADD CONSTRAINT "processed_posts_knowledgeDocumentId_fkey" FOREIGN KEY ("knowledgeDocumentId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
