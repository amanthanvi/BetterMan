-- BetterMan Complete Database Reset and Setup
-- WARNING: This script will DROP all existing tables and recreate everything from scratch
-- Run this in the Supabase SQL Editor

-- First, drop all triggers that might be using the update_updated_at_column function
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    -- Find and drop all triggers that use update_updated_at_column
    FOR trigger_record IN
        SELECT DISTINCT trigger_name, event_object_table
        FROM information_schema.triggers
        WHERE action_statement LIKE '%update_updated_at_column%'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I CASCADE', 
                      trigger_record.trigger_name, 
                      trigger_record.event_object_table);
    END LOOP;
END $$;

-- Drop all existing BetterMan tables and any other tables that might conflict
DROP TABLE IF EXISTS favorites CASCADE;
DROP TABLE IF EXISTS view_history CASCADE;
DROP TABLE IF EXISTS search_history CASCADE;
DROP TABLE IF EXISTS documents CASCADE;

-- Also drop these tables that seem to exist in your database
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS bookmarks CASCADE;
DROP TABLE IF EXISTS notes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop existing indexes if they exist
DROP INDEX IF EXISTS idx_documents_name;
DROP INDEX IF EXISTS idx_documents_section;
DROP INDEX IF EXISTS idx_documents_category;
DROP INDEX IF EXISTS idx_documents_is_common;
DROP INDEX IF EXISTS idx_documents_search;
DROP INDEX IF EXISTS idx_documents_name_trgm;

-- Drop existing functions with CASCADE to remove dependencies
DROP FUNCTION IF EXISTS search_documents(TEXT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS search_documents(TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search

-- Create documents table (man pages)
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    section INTEGER NOT NULL,
    title VARCHAR(500),
    description TEXT,
    synopsis TEXT,
    content TEXT,
    category VARCHAR(100),
    is_common BOOLEAN DEFAULT FALSE,
    complexity VARCHAR(20) CHECK (complexity IN ('basic', 'intermediate', 'advanced')),
    keywords TEXT[],
    see_also JSONB,
    related_commands TEXT[],
    examples JSONB,
    options JSONB,
    search_content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_name_section UNIQUE(name, section)
);

-- Create indexes for performance
CREATE INDEX idx_documents_name ON documents(name);
CREATE INDEX idx_documents_section ON documents(section);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_is_common ON documents(is_common);
CREATE INDEX idx_documents_search ON documents USING gin(to_tsvector('english', COALESCE(search_content, '')));
CREATE INDEX idx_documents_name_trgm ON documents USING gin(name gin_trgm_ops);

-- Create search history table
CREATE TABLE search_history (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    results_count INTEGER,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create view history table
CREATE TABLE view_history (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create favorites table
CREATE TABLE favorites (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_document UNIQUE(document_id, user_id)
);

-- Create updated_at trigger function (fresh version)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for documents
CREATE TRIGGER update_documents_updated_at 
    BEFORE UPDATE ON documents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for all possible policy names)
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Drop all policies on our tables
    FOR policy_record IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE tablename IN ('documents', 'search_history', 'view_history', 'favorites')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 
                      policy_record.policyname, 
                      policy_record.tablename);
    END LOOP;
END $$;

-- Create RLS policies
-- Documents are public to read
CREATE POLICY "Documents are viewable by everyone" ON documents
    FOR SELECT USING (true);

-- Only authenticated users can insert/update/delete documents (for admin)
CREATE POLICY "Only authenticated users can insert documents" ON documents
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Only authenticated users can update documents" ON documents
    FOR UPDATE WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Only authenticated users can delete documents" ON documents
    FOR DELETE USING (auth.uid() IS NOT NULL);

-- Search history is private to each user
CREATE POLICY "Users can view own search history" ON search_history
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own search history" ON search_history
    FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- View history is private to each user
CREATE POLICY "Users can view own view history" ON view_history
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own view history" ON view_history
    FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Favorites are private to each user
CREATE POLICY "Users can view own favorites" ON favorites
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own favorites" ON favorites
    FOR ALL USING (auth.uid() = user_id);

-- Create search function
CREATE OR REPLACE FUNCTION search_documents(search_query TEXT)
RETURNS TABLE (
    id INTEGER,
    name VARCHAR(255),
    section INTEGER,
    title VARCHAR(500),
    description TEXT,
    category VARCHAR(100),
    is_common BOOLEAN,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.name,
        d.section,
        d.title,
        d.description,
        d.category,
        d.is_common,
        CASE 
            WHEN d.name = search_query THEN 100.0
            WHEN d.name ILIKE search_query THEN 90.0
            WHEN d.name ILIKE search_query || '%' THEN 80.0
            WHEN d.name ILIKE '%' || search_query || '%' THEN 70.0
            WHEN d.title ILIKE '%' || search_query || '%' THEN 60.0
            WHEN d.description ILIKE '%' || search_query || '%' THEN 50.0
            WHEN d.search_content ILIKE '%' || search_query || '%' THEN 40.0
            ELSE 30.0
        END::REAL AS rank
    FROM documents d
    WHERE 
        d.name ILIKE '%' || search_query || '%'
        OR d.title ILIKE '%' || search_query || '%'
        OR d.description ILIKE '%' || search_query || '%'
        OR d.search_content ILIKE '%' || search_query || '%'
        OR to_tsvector('english', COALESCE(d.search_content, '')) @@ plainto_tsquery('english', search_query)
    ORDER BY
        rank DESC,
        d.is_common DESC,
        d.name;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON documents TO anon, authenticated;
GRANT ALL ON documents TO authenticated;
GRANT ALL ON search_history TO authenticated;
GRANT ALL ON view_history TO authenticated;
GRANT ALL ON favorites TO authenticated;
GRANT EXECUTE ON FUNCTION search_documents(TEXT) TO anon, authenticated;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Create indexes on user tables for performance
CREATE INDEX idx_search_history_user_id ON search_history(user_id);
CREATE INDEX idx_search_history_created_at ON search_history(created_at DESC);
CREATE INDEX idx_view_history_user_id ON view_history(user_id);
CREATE INDEX idx_view_history_document_id ON view_history(document_id);
CREATE INDEX idx_view_history_viewed_at ON view_history(viewed_at DESC);
CREATE INDEX idx_favorites_user_id ON favorites(user_id);
CREATE INDEX idx_favorites_document_id ON favorites(document_id);

-- Add some helpful comments
COMMENT ON TABLE documents IS 'Stores all man page documentation';
COMMENT ON TABLE search_history IS 'Tracks user search queries for analytics';
COMMENT ON TABLE view_history IS 'Tracks which documents users have viewed';
COMMENT ON TABLE favorites IS 'Stores user-favorited documents';
COMMENT ON FUNCTION search_documents IS 'Full-text search across all document fields';

-- Verify setup
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Database setup completed successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  • documents (man pages)';
    RAISE NOTICE '  • search_history';
    RAISE NOTICE '  • view_history';
    RAISE NOTICE '  • favorites';
    RAISE NOTICE '';
    RAISE NOTICE 'Features enabled:';
    RAISE NOTICE '  • Row Level Security (RLS)';
    RAISE NOTICE '  • Full-text search';
    RAISE NOTICE '  • Automatic updated_at timestamps';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Ready to load data!';
    RAISE NOTICE '';
END $$;