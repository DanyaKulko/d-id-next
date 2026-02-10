ALTER TABLE "knowledge_bases"
ADD COLUMN "isEnabled" BOOLEAN NOT NULL DEFAULT true;

DO $$
DECLARE
  disabled_value TEXT;
BEGIN
  SELECT value
  INTO disabled_value
  FROM "app_settings"
  WHERE key = 'disabledKnowledgeDocs'
  LIMIT 1;

  IF disabled_value IS NULL OR btrim(disabled_value) = '' THEN
    DELETE FROM "app_settings" WHERE key = 'disabledKnowledgeDocs';
    RETURN;
  END IF;

  BEGIN
    WITH disabled_entries AS (
      SELECT btrim(value) AS entry
      FROM jsonb_array_elements_text(disabled_value::jsonb) AS value
    ),
    normalized_entries AS (
      SELECT DISTINCT
        entry,
        regexp_replace(entry, '^.*#', '') AS normalized_entry
      FROM disabled_entries
      WHERE entry <> ''
    )
    UPDATE "knowledge_bases" AS kb
    SET "isEnabled" = false
    FROM normalized_entries AS d
    WHERE kb.id = d.entry
      OR kb."documentId" = d.entry
      OR kb."documentId" = d.normalized_entry;
  EXCEPTION
    WHEN others THEN
      UPDATE "knowledge_bases"
      SET "isEnabled" = false
      WHERE id = btrim(disabled_value)
        OR "documentId" = btrim(disabled_value)
        OR "documentId" = regexp_replace(btrim(disabled_value), '^.*#', '');
  END;

  DELETE FROM "app_settings" WHERE key = 'disabledKnowledgeDocs';
END $$;
