"""
Add analytics tables for tracking page views, searches, and feature usage.
"""


def upgrade(conn):
    """Add analytics-related tables."""
    
    # Create page_views table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            document_id INTEGER NOT NULL,
            session_id VARCHAR(128),
            ip_hash VARCHAR(64),
            user_agent TEXT,
            referrer TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
        )
    """)
    
    # Create indexes for page_views
    conn.execute("CREATE INDEX idx_page_views_user_id ON page_views(user_id)")
    conn.execute("CREATE INDEX idx_page_views_document_id ON page_views(document_id)")
    conn.execute("CREATE INDEX idx_page_views_created_at ON page_views(created_at)")
    conn.execute("CREATE INDEX idx_page_views_session_id ON page_views(session_id)")
    
    # Create search_analytics table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS search_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query VARCHAR(500) NOT NULL,
            results_count INTEGER NOT NULL,
            user_id INTEGER,
            session_id VARCHAR(128),
            search_duration_ms INTEGER,
            clicked_result_id INTEGER,
            clicked_position INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
            FOREIGN KEY (clicked_result_id) REFERENCES documents (id) ON DELETE SET NULL
        )
    """)
    
    # Create indexes for search_analytics
    conn.execute("CREATE INDEX idx_search_analytics_query ON search_analytics(query)")
    conn.execute("CREATE INDEX idx_search_analytics_user_id ON search_analytics(user_id)")
    conn.execute("CREATE INDEX idx_search_analytics_created_at ON search_analytics(created_at)")
    conn.execute("CREATE INDEX idx_search_analytics_clicked_result_id ON search_analytics(clicked_result_id)")
    
    # Create feature_usage table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS feature_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            feature_name VARCHAR(100) NOT NULL,
            action VARCHAR(100) NOT NULL,
            feature_metadata TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)
    
    # Create indexes for feature_usage
    conn.execute("CREATE INDEX idx_feature_usage_user_id ON feature_usage(user_id)")
    conn.execute("CREATE INDEX idx_feature_usage_feature_name ON feature_usage(feature_name)")
    conn.execute("CREATE INDEX idx_feature_usage_created_at ON feature_usage(created_at)")
    
    # Create user_notes table for tracking user-created notes
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            document_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
        )
    """)
    
    # Create indexes for user_notes
    conn.execute("CREATE INDEX idx_user_notes_user_id ON user_notes(user_id)")
    conn.execute("CREATE INDEX idx_user_notes_document_id ON user_notes(document_id)")
    
    # Create cache_metadata table for cache analytics
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cache_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key VARCHAR(255) NOT NULL,
            hit_count INTEGER DEFAULT 0,
            miss_count INTEGER DEFAULT 0,
            last_accessed TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            UNIQUE(cache_key)
        )
    """)
    
    # Create index for cache_metadata
    conn.execute("CREATE INDEX idx_cache_metadata_cache_key ON cache_metadata(cache_key)")
    
    # Add view_count column to documents table if not exists
    conn.execute("""
        ALTER TABLE documents ADD COLUMN view_count INTEGER DEFAULT 0
    """)
    
    # Create index for view_count
    conn.execute("CREATE INDEX idx_documents_view_count ON documents(view_count DESC)")
    
    print("✓ Created analytics tables")


def downgrade(conn):
    """Remove analytics-related tables."""
    conn.execute("DROP TABLE IF EXISTS cache_metadata")
    conn.execute("DROP TABLE IF EXISTS user_notes")
    conn.execute("DROP TABLE IF EXISTS feature_usage")
    conn.execute("DROP TABLE IF EXISTS search_analytics")
    conn.execute("DROP TABLE IF EXISTS page_views")
    
    # Remove view_count column from documents table
    # Note: SQLite doesn't support dropping columns directly
    # In production, you'd need to recreate the table without this column
    
    print("✓ Removed analytics tables")