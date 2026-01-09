-- Add avatar fallback image to agents
ALTER TABLE "agents" ADD COLUMN "avatarImageUrl" TEXT;

-- Create enum for chat message roles
CREATE TYPE "ChatMessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT');

-- Create chat sessions table
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "didAgentId" TEXT NOT NULL,
    "didStreamId" TEXT NOT NULL,
    "didSessionId" TEXT,
    "didChatId" TEXT NOT NULL,
    "agentId" TEXT,
    "userId" TEXT,
    "language" TEXT,
    "device" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- Create chat messages table
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "chat_sessions_didStreamId_key" ON "chat_sessions"("didStreamId");
CREATE UNIQUE INDEX "chat_sessions_didChatId_key" ON "chat_sessions"("didChatId");
CREATE INDEX "chat_sessions_agentId_createdAt_idx" ON "chat_sessions"("agentId", "createdAt");
CREATE INDEX "chat_sessions_userId_createdAt_idx" ON "chat_sessions"("userId", "createdAt");
CREATE INDEX "chat_messages_sessionId_createdAt_idx" ON "chat_messages"("sessionId", "createdAt");

-- Foreign keys
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
