-- Migration: Add content_hash, summary, and FTS support
-- Run this manually or via Alembic

-- Add new columns for content hash and summary
ALTER TABLE man_pages ADD COLUMN IF NOT EXISTS content_hash varchar(64);
ALTER TABLE man_pages ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE man_pages ADD COLUMN IF NOT EXISTS raw_content text;
CREATE INDEX IF NOT EXISTS idx_man_pages_content_hash ON man_pages(content_hash);

-- Enable extensions for search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Add FTS column and indexes
ALTER TABLE man_pages ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_man_pages_sv ON man_pages USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_man_pages_name_trgm ON man_pages USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_man_pages_title_trgm ON man_pages USING GIN(title gin_trgm_ops);

-- Create trigger to keep search_vector fresh
CREATE OR REPLACE FUNCTION man_pages_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
      setweight(to_tsvector('english', coalesce(NEW.name,'')), 'A') ||
      setweight(to_tsvector('english', coalesce(NEW.title,'')), 'B') ||
      setweight(to_tsvector('english', coalesce(NEW.summary,'')), 'C') ||
      setweight(to_tsvector('english', coalesce(NEW.description,'')), 'D');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_man_pages_tsv ON man_pages;
CREATE TRIGGER trg_man_pages_tsv BEFORE INSERT OR UPDATE ON man_pages
FOR EACH ROW EXECUTE FUNCTION man_pages_tsv_update();

-- Optional: Add alias support
ALTER TABLE man_pages ADD COLUMN IF NOT EXISTS is_alias_of uuid;