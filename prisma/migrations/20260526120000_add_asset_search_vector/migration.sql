-- Per-asset full-text index built from the Vision image caption.
-- This lets photo search match individual photos by what they actually show,
-- not just by the parent post's title/region/body.

ALTER TABLE "blog_media_assets" ADD COLUMN "searchVector" tsvector;

CREATE INDEX "blog_media_assets_search_vector_gin"
    ON "blog_media_assets" USING GIN ("searchVector");

CREATE OR REPLACE FUNCTION blog_media_assets_update_search_vector()
RETURNS trigger AS $$
BEGIN
    NEW."searchVector" :=
        to_tsvector('english', coalesce(NEW."imageCaption", ''));
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_media_assets_search_vector_trigger
BEFORE INSERT OR UPDATE OF "imageCaption"
ON "blog_media_assets"
FOR EACH ROW EXECUTE FUNCTION blog_media_assets_update_search_vector();

-- Backfill any rows that already carry a caption (idempotent / safe on empty set).
UPDATE "blog_media_assets"
SET "imageCaption" = "imageCaption"
WHERE "imageCaption" IS NOT NULL;
