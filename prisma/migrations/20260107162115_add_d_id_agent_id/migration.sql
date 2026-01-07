-- CreateEnum
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "name" TEXT NOT NULL,
    "roleDescription" TEXT,
    "instructions" TEXT,
    "personality" TEXT,
    "voiceID" TEXT NOT NULL,
    "backgroundEnabled" BOOLEAN NOT NULL DEFAULT false,
    "idleVideoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "avatarBackgroundId" TEXT,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents_backgrounds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_backgrounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "documentUrl" TEXT,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_agentId_key" ON "agents"("agentId");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_avatarBackgroundId_fkey" FOREIGN KEY ("avatarBackgroundId") REFERENCES "agents_backgrounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
