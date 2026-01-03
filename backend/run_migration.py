#!/usr/bin/env python3
"""Run database migration for content_hash and FTS support."""

import os
import psycopg
import sys

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:ZCuxzQlaSTETGewtXMBrtrOzCHLKTQXR@yamanote.proxy.rlwy.net:32905/railway",
)

migration = """
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

-- Update existing rows to populate search_vector
UPDATE man_pages SET search_vector = 
    setweight(to_tsvector('english', coalesce(name,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(title,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(summary,'')), 'C') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'D');
"""

print("Running migration...")
print(f"Database: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'unknown'}")

try:
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            # Execute the entire migration as one block
            # PostgreSQL can handle multiple statements
            print("Executing migration...")
            cur.execute(migration)
            conn.commit()
    print("Migration completed successfully!")
except Exception as e:
    print(f"Migration failed: {e}")
    exit(1)
