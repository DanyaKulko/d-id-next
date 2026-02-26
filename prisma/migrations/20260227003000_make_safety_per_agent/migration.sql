ALTER TABLE "agents"
ADD COLUMN "safetyRules" TEXT;

WITH global_safety AS (
  SELECT value
  FROM "app_settings"
  WHERE "key" = 'safetyRules'
  LIMIT 1
)
UPDATE "agents" AS a
SET "safetyRules" = global_safety.value
FROM global_safety
WHERE COALESCE(trim(global_safety.value), '') <> '';
