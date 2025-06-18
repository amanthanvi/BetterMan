-- BetterMan Database Schema for Supabase
-- Run this in the Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search

-- Documents table (man pages)
CREATE TABLE IF NOT EXISTS documents (
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
    UNIQUE(name, section)
);

-- Indexes for performance
CREATE INDEX idx_documents_name ON documents(name);
CREATE INDEX idx_documents_section ON documents(section);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_is_common ON documents(is_common);
CREATE INDEX idx_documents_search ON documents USING gin(to_tsvector('english', search_content));
CREATE INDEX idx_documents_name_trgm ON documents USING gin(name gin_trgm_ops);

-- Search history
CREATE TABLE IF NOT EXISTS search_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    query TEXT NOT NULL,
    results_count INTEGER,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- View history
CREATE TABLE IF NOT EXISTS view_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id),
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Favorites
CREATE TABLE IF NOT EXISTS favorites (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id),
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, user_id)
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE
    ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Documents are public to read
CREATE POLICY "Documents are viewable by everyone" ON documents
    FOR SELECT USING (true);

-- Only authenticated users can insert documents (for admin)
CREATE POLICY "Only authenticated users can insert documents" ON documents
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Search history is private to each user
CREATE POLICY "Users can view own search history" ON search_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own search history" ON search_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- View history is private to each user
CREATE POLICY "Users can view own view history" ON view_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own view history" ON view_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Favorites are private to each user
CREATE POLICY "Users can view own favorites" ON favorites
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own favorites" ON favorites
    FOR ALL USING (auth.uid() = user_id);

-- Create a function to search documents
CREATE OR REPLACE FUNCTION search_documents(search_query TEXT, limit_count INTEGER DEFAULT 20)
RETURNS SETOF documents AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM documents
    WHERE 
        name ILIKE '%' || search_query || '%'
        OR title ILIKE '%' || search_query || '%'
        OR description ILIKE '%' || search_query || '%'
        OR search_content ILIKE '%' || search_query || '%'
        OR to_tsvector('english', search_content) @@ plainto_tsquery('english', search_query)
    ORDER BY
        CASE 
            WHEN name ILIKE search_query THEN 1
            WHEN name ILIKE search_query || '%' THEN 2
            WHEN name ILIKE '%' || search_query || '%' THEN 3
            ELSE 4
        END,
        is_common DESC,
        name
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON documents TO anon, authenticated;
GRANT ALL ON documents TO authenticated;
GRANT ALL ON search_history TO authenticated;
GRANT ALL ON view_history TO authenticated;
GRANT ALL ON favorites TO authenticated;