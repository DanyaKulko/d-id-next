ALTER TABLE "agents"
ADD COLUMN "blogKnowledgeEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "agent_training_manual" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "baseKnowledge" TEXT NOT NULL DEFAULT '',
  "manualText" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_training_manual_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_training_manual_agentId_key"
ON "agent_training_manual"("agentId");

ALTER TABLE "agent_training_manual"
ADD CONSTRAINT "agent_training_manual_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "agents"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

WITH legacy_settings AS (
  SELECT
    split_part("key", ':', 2) AS agent_id,
    lower(trim(value)) AS value
  FROM "app_settings"
  WHERE "key" LIKE 'textBlogEnabled:%'
)
UPDATE "agents" AS a
SET "blogKnowledgeEnabled" = CASE
  WHEN legacy_settings.value = 'false' THEN false
  ELSE true
END
FROM legacy_settings
WHERE a.id = legacy_settings.agent_id;

WITH scoped_settings AS (
  SELECT
    split_part("key", ':', 2) AS agent_id,
    lower(trim(value)) AS value
  FROM "app_settings"
  WHERE "key" LIKE 'training.blog.enabled:%'
)
UPDATE "agents" AS a
SET "blogKnowledgeEnabled" = CASE
  WHEN scoped_settings.value = 'false' THEN false
  ELSE true
END
FROM scoped_settings
WHERE a.id = scoped_settings.agent_id;

WITH base_knowledge AS (
  SELECT split_part("key", ':', 2) AS agent_id, value
  FROM "app_settings"
  WHERE "key" LIKE 'training.manual.base_knowledge:%'
),
manual_scoped AS (
  SELECT split_part("key", ':', 2) AS agent_id, value
  FROM "app_settings"
  WHERE "key" LIKE 'training.manual.knowledge:%'
),
manual_legacy AS (
  SELECT split_part("key", ':', 2) AS agent_id, value
  FROM "app_settings"
  WHERE "key" LIKE 'manualTrainingText:%'
),
merged AS (
  SELECT
    a.id AS agent_id,
    COALESCE(base_knowledge.value, '') AS base_knowledge,
    COALESCE(manual_scoped.value, manual_legacy.value, '') AS manual_text
  FROM "agents" AS a
  LEFT JOIN base_knowledge ON base_knowledge.agent_id = a.id
  LEFT JOIN manual_scoped ON manual_scoped.agent_id = a.id
  LEFT JOIN manual_legacy ON manual_legacy.agent_id = a.id
)
INSERT INTO "agent_training_manual"(
  "id",
  "agentId",
  "baseKnowledge",
  "manualText"
)
SELECT
  'atm_' || merged.agent_id,
  merged.agent_id,
  merged.base_knowledge,
  merged.manual_text
FROM merged
WHERE merged.base_knowledge <> '' OR merged.manual_text <> ''
ON CONFLICT ("agentId") DO UPDATE
SET
  "baseKnowledge" = EXCLUDED."baseKnowledge",
  "manualText" = EXCLUDED."manualText",
  "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "app_settings"
WHERE
  "key" LIKE 'training.blog.enabled:%'
  OR "key" LIKE 'textBlogEnabled:%'
  OR "key" LIKE 'training.manual.base_knowledge:%'
  OR "key" LIKE 'training.manual.knowledge:%'
  OR "key" LIKE 'manualTrainingText:%'
  OR "key" LIKE 'manualTrainingDocId:%'
  OR "key" LIKE 'manualTrainingFilePath:%';
