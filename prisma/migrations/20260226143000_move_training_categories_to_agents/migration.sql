ALTER TABLE "agents"
ADD COLUMN "blogCategoryIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

WITH parsed AS (
  SELECT
    split_part("key", ':', 2) AS agent_id,
    ARRAY(
      SELECT DISTINCT CAST(item AS INTEGER)
      FROM unnest(
        string_to_array(
          regexp_replace(value, '[^0-9,]', '', 'g'),
          ','
        )
      ) AS item
      WHERE item <> ''
      ORDER BY CAST(item AS INTEGER)
    ) AS category_ids
  FROM "app_settings"
  WHERE "key" LIKE 'training.blog.category_ids:%'
)
UPDATE "agents" AS a
SET "blogCategoryIds" = parsed.category_ids
FROM parsed
WHERE a.id = parsed.agent_id
  AND parsed.category_ids IS NOT NULL
  AND array_length(parsed.category_ids, 1) > 0;

DELETE FROM "app_settings"
WHERE "key" LIKE 'training.blog.category_ids:%';
