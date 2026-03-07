CREATE TABLE "user_web_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_web_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_web_sessions_tokenHash_key"
ON "user_web_sessions"("tokenHash");

CREATE INDEX "user_web_sessions_userId_endedAt_lastSeenAt_idx"
ON "user_web_sessions"("userId", "endedAt", "lastSeenAt");

CREATE INDEX "user_web_sessions_endedAt_lastSeenAt_idx"
ON "user_web_sessions"("endedAt", "lastSeenAt");

ALTER TABLE "user_web_sessions"
ADD CONSTRAINT "user_web_sessions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
