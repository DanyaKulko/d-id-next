-- CreateEnum
CREATE TYPE "ExternalSourceKind" AS ENUM ('TEXT', 'VIDEO');

-- CreateTable
CREATE TABLE "external_sources" (
    "id" TEXT NOT NULL,
    "kind" "ExternalSourceKind" NOT NULL,
    "label" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "accessKey" TEXT,
    "documentId" TEXT,
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_sources_kind_key" ON "external_sources"("kind");
