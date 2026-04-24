CREATE TYPE "BlogPostType" AS ENUM ('ALBUM', 'POSTCARD', 'TRAVEL_TIP', 'GLOBAL_TIP', 'BLOG', 'VIDEO', 'OTHER');
CREATE TYPE "BlogCaptionStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'SKIPPED');
CREATE TYPE "BlogMediaKind" AS ENUM ('PHOTO', 'VIDEO');

CREATE TABLE "blog_posts" (
    "id" INTEGER NOT NULL,
    "type" "BlogPostType" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "link" TEXT,
    "regionName" TEXT,
    "continentName" TEXT,
    "contentText" TEXT NOT NULL,
    "captionText" TEXT,
    "captionStatus" "BlogCaptionStatus" NOT NULL DEFAULT 'PENDING',
    "captionModel" TEXT,
    "captionError" TEXT,
    "captionedAt" TIMESTAMP(3),
    "language" TEXT,
    "publishedAt" TIMESTAMP(3),
    "remoteUpdatedAt" TIMESTAMP(3),
    "searchVector" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "blog_posts_type_idx" ON "blog_posts"("type");
CREATE INDEX "blog_posts_captionStatus_idx" ON "blog_posts"("captionStatus");
CREATE INDEX "blog_posts_remoteUpdatedAt_idx" ON "blog_posts"("remoteUpdatedAt");
CREATE INDEX "blog_posts_search_vector_gin" ON "blog_posts" USING GIN ("searchVector");

CREATE TABLE "blog_media_assets" (
    "id" TEXT NOT NULL,
    "postId" INTEGER NOT NULL,
    "kind" "BlogMediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "embedUrl" TEXT,
    "mimeType" TEXT,
    "title" TEXT,
    "imageCaption" TEXT,
    "imageCaptionModel" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_media_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blog_media_assets_postId_sourceId_key" ON "blog_media_assets"("postId", "sourceId");
CREATE INDEX "blog_media_assets_kind_idx" ON "blog_media_assets"("kind");
CREATE INDEX "blog_media_assets_postId_orderIndex_idx" ON "blog_media_assets"("postId", "orderIndex");

ALTER TABLE "blog_media_assets"
    ADD CONSTRAINT "blog_media_assets_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "blog_ingest_state" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_ingest_state_pkey" PRIMARY KEY ("key")
);

CREATE OR REPLACE FUNCTION blog_posts_update_search_vector()
RETURNS trigger AS $$
BEGIN
    NEW."searchVector" :=
        setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW."regionName", '') || ' ' || coalesce(NEW."continentName", '')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW."captionText", NEW."contentText", '')), 'C');
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_search_vector_trigger
BEFORE INSERT OR UPDATE OF "title", "regionName", "continentName", "captionText", "contentText"
ON "blog_posts"
FOR EACH ROW EXECUTE FUNCTION blog_posts_update_search_vector();
