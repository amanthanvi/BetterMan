#!/usr/bin/env python3
"""
Set up SQLite database with FTS5 for man pages
"""
import sqlite3
import os
from pathlib import Path

DATABASE_PATH = os.getenv('DATABASE_PATH', '/data/betterman.db')

def create_database():
    """Create SQLite database with optimized settings"""
    # Ensure directory exists
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    
    # Enable optimizations
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA cache_size = -64000")  # 64MB cache
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA mmap_size = 30000000000")  # 30GB mmap
    
    # Create main table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS man_pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            section INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            synopsis TEXT,
            content TEXT,
            category TEXT,
            is_common BOOLEAN DEFAULT 0,
            complexity TEXT CHECK(complexity IN ('basic', 'intermediate', 'advanced')),
            keywords TEXT,  -- JSON array
            see_also TEXT,  -- JSON array
            related_commands TEXT,  -- JSON array
            examples TEXT,  -- JSON array
            options TEXT,   -- JSON array
            author TEXT,
            source TEXT,
            manual TEXT,
            parsed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, section)
        )
    """)
    
    # Create FTS5 virtual table for full-text search
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS man_pages_fts USING fts5(
            name,
            title,
            description,
            synopsis,
            content,
            keywords,
            content=man_pages,
            content_rowid=id,
            tokenize='porter unicode61'
        )
    """)
    
    # Create triggers to keep FTS in sync
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS man_pages_ai AFTER INSERT ON man_pages
        BEGIN
            INSERT INTO man_pages_fts(
                rowid, name, title, description, synopsis, content, keywords
            ) VALUES (
                new.id, new.name, new.title, new.description, 
                new.synopsis, new.content, new.keywords
            );
        END
    """)
    
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS man_pages_ad AFTER DELETE ON man_pages
        BEGIN
            DELETE FROM man_pages_fts WHERE rowid = old.id;
        END
    """)
    
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS man_pages_au AFTER UPDATE ON man_pages
        BEGIN
            DELETE FROM man_pages_fts WHERE rowid = old.id;
            INSERT INTO man_pages_fts(
                rowid, name, title, description, synopsis, content, keywords
            ) VALUES (
                new.id, new.name, new.title, new.description,
                new.synopsis, new.content, new.keywords
            );
        END
    """)
    
    # Create indices
    conn.execute("CREATE INDEX IF NOT EXISTS idx_man_pages_name ON man_pages(name)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_man_pages_section ON man_pages(section)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_man_pages_category ON man_pages(category)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_man_pages_common ON man_pages(is_common)")
    
    # Create analytics table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS search_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            results_count INTEGER,
            clicked_result TEXT,
            user_ip TEXT,
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create user preferences table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            theme TEXT DEFAULT 'system',
            favorite_commands TEXT,  -- JSON array
            recent_commands TEXT,    -- JSON array
            settings TEXT,           -- JSON object
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    conn.close()
    
    print(f"✅ Database created at {DATABASE_PATH}")
    print("✅ FTS5 search enabled")
    print("✅ Optimizations applied")

if __name__ == "__main__":
    create_database()