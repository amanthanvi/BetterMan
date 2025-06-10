"""
Add OAuth and personalization tables.
"""

from sqlalchemy import text


def upgrade(conn):
    """Add OAuth and personalization tables."""
    
    # Create OAuth accounts table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS oauth_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider VARCHAR(20) NOT NULL,
            provider_account_id VARCHAR(255) NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            token_type VARCHAR(50),
            expires_at TIMESTAMP,
            provider_data TEXT,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            last_used TIMESTAMP,
            unique_provider_account VARCHAR GENERATED ALWAYS AS (provider || ':' || provider_account_id) STORED UNIQUE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """))
    
    # Create indexes
    conn.execute(text("CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id)"))
    conn.execute(text("CREATE INDEX idx_oauth_accounts_provider ON oauth_accounts(provider)"))
    
    # Create user sessions table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id VARCHAR(64) UNIQUE NOT NULL,
            device_name VARCHAR(255),
            device_type VARCHAR(50),
            browser VARCHAR(100),
            os VARCHAR(100),
            ip_address VARCHAR(45),
            location VARCHAR(255),
            is_active BOOLEAN DEFAULT TRUE NOT NULL,
            last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """))
    
    # Create indexes
    conn.execute(text("CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id)"))
    conn.execute(text("CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id)"))
    conn.execute(text("CREATE INDEX idx_user_sessions_is_active ON user_sessions(is_active)"))
    
    # Create two-factor auth table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS two_factor_auth (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            totp_secret VARCHAR(32),
            totp_enabled BOOLEAN DEFAULT FALSE NOT NULL,
            backup_codes TEXT,
            phone_number VARCHAR(20),
            sms_enabled BOOLEAN DEFAULT FALSE NOT NULL,
            phone_verified BOOLEAN DEFAULT FALSE NOT NULL,
            user_id INTEGER UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """))
    
    # Create index
    conn.execute(text("CREATE INDEX idx_two_factor_auth_user_id ON two_factor_auth(user_id)"))
    
    # Create user preferences table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            theme VARCHAR(20) DEFAULT 'system',
            language VARCHAR(10) DEFAULT 'en',
            timezone VARCHAR(50) DEFAULT 'UTC',
            keyboard_shortcuts TEXT,
            font_size VARCHAR(10) DEFAULT 'medium',
            line_height VARCHAR(10) DEFAULT 'normal',
            code_theme VARCHAR(50) DEFAULT 'monokai',
            enable_animations BOOLEAN DEFAULT TRUE NOT NULL,
            enable_sounds BOOLEAN DEFAULT FALSE NOT NULL,
            enable_notifications BOOLEAN DEFAULT TRUE NOT NULL,
            show_profile_publicly BOOLEAN DEFAULT TRUE NOT NULL,
            share_statistics BOOLEAN DEFAULT TRUE NOT NULL,
            user_id INTEGER UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """))
    
    # Create index
    conn.execute(text("CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id)"))
    
    # Create user collections table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS user_collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            is_public BOOLEAN DEFAULT FALSE NOT NULL,
            is_featured BOOLEAN DEFAULT FALSE NOT NULL,
            items TEXT NOT NULL DEFAULT '[]',
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """))
    
    # Create indexes
    conn.execute(text("CREATE INDEX idx_user_collections_user_id ON user_collections(user_id)"))
    conn.execute(text("CREATE INDEX idx_user_collections_is_public ON user_collections(is_public)"))
    
    # Create learning progress table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS learning_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            documents_viewed INTEGER DEFAULT 0 NOT NULL,
            commands_learned INTEGER DEFAULT 0 NOT NULL,
            time_spent_minutes INTEGER DEFAULT 0 NOT NULL,
            current_streak INTEGER DEFAULT 0 NOT NULL,
            longest_streak INTEGER DEFAULT 0 NOT NULL,
            last_activity_date TIMESTAMP,
            achievements TEXT DEFAULT '[]',
            achievement_points INTEGER DEFAULT 0 NOT NULL,
            completed_paths TEXT DEFAULT '[]',
            user_id INTEGER UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """))
    
    # Create index
    conn.execute(text("CREATE INDEX idx_learning_progress_user_id ON learning_progress(user_id)"))
    
    # Create command snippets table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS command_snippets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title VARCHAR(255) NOT NULL,
            command TEXT NOT NULL,
            description TEXT,
            category VARCHAR(100),
            tags TEXT,
            is_public BOOLEAN DEFAULT FALSE NOT NULL,
            usage_count INTEGER DEFAULT 0 NOT NULL,
            last_used TIMESTAMP,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """))
    
    # Create indexes
    conn.execute(text("CREATE INDEX idx_command_snippets_user_id ON command_snippets(user_id)"))
    conn.execute(text("CREATE INDEX idx_command_snippets_is_public ON command_snippets(is_public)"))
    conn.execute(text("CREATE INDEX idx_command_snippets_category ON command_snippets(category)"))
    
    # Add missing columns to search_history if needed
    conn.execute(text("""
        ALTER TABLE search_history ADD COLUMN clicked_result_id INTEGER
    """))
    
    conn.execute(text("""
        ALTER TABLE search_history ADD COLUMN selected_result VARCHAR(255)
    """))
    
    # Add searched_at column as alias for created_at
    conn.execute(text("""
        ALTER TABLE search_history ADD COLUMN searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    """))
    
    print("✓ Created OAuth and personalization tables")


def downgrade(conn):
    """Remove OAuth and personalization tables."""
    conn.execute(text("DROP TABLE IF EXISTS command_snippets"))
    conn.execute(text("DROP TABLE IF EXISTS learning_progress"))
    conn.execute(text("DROP TABLE IF EXISTS user_collections"))
    conn.execute(text("DROP TABLE IF EXISTS user_preferences"))
    conn.execute(text("DROP TABLE IF EXISTS two_factor_auth"))
    conn.execute(text("DROP TABLE IF EXISTS user_sessions"))
    conn.execute(text("DROP TABLE IF EXISTS oauth_accounts"))
    print("✓ Removed OAuth and personalization tables")