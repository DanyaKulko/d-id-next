/*
  Warnings:

  - You are about to drop the column `avatarBackgroundId` on the `agents` table. All the data in the column will be lost.
  - You are about to drop the `agents_backgrounds` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[slug]` on the table `agents` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "agents" DROP CONSTRAINT "agents_avatarBackgroundId_fkey";

-- AlterTable
ALTER TABLE "agents" DROP COLUMN "avatarBackgroundId",
ADD COLUMN     "slug" TEXT;

-- DropTable
DROP TABLE "agents_backgrounds";

-- CreateTable
CREATE TABLE "agent_backgrounds" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_backgrounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_backgrounds_agentId_idx" ON "agent_backgrounds"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "agents_slug_key" ON "agents"("slug");

-- AddForeignKey
ALTER TABLE "agent_backgrounds" ADD CONSTRAINT "agent_backgrounds_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
