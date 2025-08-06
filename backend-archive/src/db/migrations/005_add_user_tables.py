"""
Add user authentication tables.
"""

from sqlalchemy import text


def upgrade(conn):
    """Add user-related tables."""
    
    # Create users table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            full_name VARCHAR(255),
            bio TEXT,
            avatar_url VARCHAR(500),
            is_active BOOLEAN DEFAULT TRUE NOT NULL,
            is_superuser BOOLEAN DEFAULT FALSE NOT NULL,
            is_verified BOOLEAN DEFAULT FALSE NOT NULL,
            email_verification_token VARCHAR(255) UNIQUE,
            password_reset_token VARCHAR(255) UNIQUE,
            password_reset_expires TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            last_login TIMESTAMP,
            failed_login_attempts INTEGER DEFAULT 0 NOT NULL,
            locked_until TIMESTAMP
        )
    """))
    
    # Create indexes
    conn.execute(text("CREATE INDEX idx_users_username ON users(username)"))
    conn.execute(text("CREATE INDEX idx_users_email ON users(email)"))
    conn.execute(text("CREATE INDEX idx_users_is_active ON users(is_active)"))
    
    # Create API keys table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key VARCHAR(64) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            scopes TEXT,
            rate_limit INTEGER DEFAULT 1000,
            is_active BOOLEAN DEFAULT TRUE NOT NULL,
            expires_at TIMESTAMP,
            last_used TIMESTAMP,
            usage_count INTEGER DEFAULT 0 NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            revoked_at TIMESTAMP,
            user_id INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """))
    
    # Create indexes
    conn.execute(text("CREATE INDEX idx_api_keys_key ON api_keys(key)"))
    conn.execute(text("CREATE INDEX idx_api_keys_user_id ON api_keys(user_id)"))
    conn.execute(text("CREATE INDEX idx_api_keys_is_active ON api_keys(is_active)"))
    
    # Create user favorites table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS user_favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            document_id INTEGER NOT NULL,
            notes TEXT,
            tags TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
            UNIQUE(user_id, document_id)
        )
    """))
    
    # Create indexes
    conn.execute(text("CREATE INDEX idx_user_favorites_user_id ON user_favorites(user_id)"))
    conn.execute(text("CREATE INDEX idx_user_favorites_document_id ON user_favorites(document_id)"))
    
    # Create search history table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            query VARCHAR(500) NOT NULL,
            section INTEGER,
            results_count INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """))
    
    # Create indexes
    conn.execute(text("CREATE INDEX idx_search_history_user_id ON search_history(user_id)"))
    conn.execute(text("CREATE INDEX idx_search_history_created_at ON search_history(created_at)"))
    
    # Create default admin user (password: admin123!)
    conn.execute(text("""
        INSERT INTO users (username, email, hashed_password, is_active, is_superuser, is_verified)
        VALUES (
            'admin',
            'admin@betterman.local',
            '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiGc3lSj.yJi',
            TRUE,
            TRUE,
            TRUE
        )
    """))
    
    print("✓ Created user authentication tables")


def downgrade(conn):
    """Remove user-related tables."""
    conn.execute(text("DROP TABLE IF EXISTS search_history"))
    conn.execute(text("DROP TABLE IF EXISTS user_favorites"))
    conn.execute(text("DROP TABLE IF EXISTS api_keys"))
    conn.execute(text("DROP TABLE IF EXISTS users"))
    print("✓ Removed user authentication tables")