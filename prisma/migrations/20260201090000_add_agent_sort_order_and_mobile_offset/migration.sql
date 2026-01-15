-- Add ordering and mobile offset controls to agents
ALTER TABLE "agents"
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mobileVideoOffsetPx" INTEGER NOT NULL DEFAULT 0;
