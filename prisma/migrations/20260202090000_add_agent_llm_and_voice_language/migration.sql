-- Store LLM and voice language settings on agents
ALTER TABLE "agents"
  ADD COLUMN "voiceLanguage" TEXT,
  ADD COLUMN "llmModel" TEXT,
  ADD COLUMN "llmTemplate" TEXT;
