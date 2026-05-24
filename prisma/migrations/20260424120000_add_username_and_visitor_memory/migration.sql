ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

ALTER TABLE "chat_sessions" ADD COLUMN "visitorId" TEXT;
ALTER TABLE "chat_sessions" ADD COLUMN "summarizedAt" TIMESTAMP(3);
CREATE INDEX "chat_sessions_visitorId_createdAt_idx" ON "chat_sessions"("visitorId", "createdAt");
CREATE INDEX "chat_sessions_summarizedAt_idx" ON "chat_sessions"("summarizedAt");

CREATE TABLE "visitor_memories" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "visitorId" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "displayName" TEXT,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "lastSessionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_memories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "visitor_memories_userId_key" ON "visitor_memories"("userId");
CREATE UNIQUE INDEX "visitor_memories_visitorId_key" ON "visitor_memories"("visitorId");
ALTER TABLE "visitor_memories" ADD CONSTRAINT "visitor_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
