-- Create enum for external service log level
CREATE TYPE "ExternalServiceLogLevel" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- Create external service logs table
CREATE TABLE "external_service_logs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "level" "ExternalServiceLogLevel" NOT NULL DEFAULT 'ERROR',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_service_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_service_logs_source_createdAt_idx" ON "external_service_logs"("source", "createdAt");
