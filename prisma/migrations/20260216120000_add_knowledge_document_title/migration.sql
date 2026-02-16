ALTER TABLE "knowledge_bases"
ADD COLUMN "title" TEXT;

UPDATE "knowledge_bases"
SET "title" = "source"
WHERE "title" IS NULL;

UPDATE "knowledge_bases"
SET "source" = 'Text blog'
WHERE "source" ~* '^text blog \(part #[0-9]+\)$';

WITH text_blog_ordered AS (
  SELECT
    id,
    row_number() OVER (ORDER BY "createdAt", id) AS part_number
  FROM "knowledge_bases"
  WHERE lower("source") = 'text blog'
)
UPDATE "knowledge_bases" AS kb
SET "title" = 'Text Blog (Part #' || text_blog_ordered.part_number || ')'
FROM text_blog_ordered
WHERE kb.id = text_blog_ordered.id
  AND (
    kb."title" IS NULL
    OR btrim(kb."title") = ''
    OR lower(kb."title") = lower(kb."source")
  );
