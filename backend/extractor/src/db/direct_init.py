"""Direct database initialization with test data."""

import sqlite3
import os
from pathlib import Path
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get the absolute path for the data directory
data_dir = Path(__file__).parent.parent.parent / "data"
data_dir.mkdir(exist_ok=True)
db_path = data_dir / "betterman.db"

logger.info(f"Database path: {db_path}")


def init_db():
    """Initialize an SQLite database with schema and test data to support the hybrid caching system."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create tables
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        title TEXT,
        section INTEGER,
        summary TEXT,
        raw_content TEXT,
        is_common BOOLEAN DEFAULT FALSE,
        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        cache_status TEXT DEFAULT 'on_demand', -- Options: 'on_demand', 'permanent', 'temporary'
        cache_priority INTEGER DEFAULT 0, -- Higher values indicate higher priority
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER,
        name TEXT,
        content TEXT,
        "order" INTEGER,
        FOREIGN KEY (document_id) REFERENCES documents(id)
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS subsections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id INTEGER,
        name TEXT,
        content TEXT,
        "order" INTEGER,
        FOREIGN KEY (section_id) REFERENCES sections(id)
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS related_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER,
        related_name TEXT,
        FOREIGN KEY (document_id) REFERENCES documents(id)
    )
    """
    )

    # Add new table for search index
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS search_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER,
        content TEXT,
        weight REAL DEFAULT 1.0,
        FOREIGN KEY (document_id) REFERENCES documents(id)
    )
    """
    )

    # Add new table for user bookmarks (for future use)
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        document_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
    )
    """
    )

    # Add new table for cache management
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS cache_management (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        last_eviction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        max_cache_size INTEGER DEFAULT 1024,
        cache_retention_days INTEGER DEFAULT 7
    )
    """
    )

    # Create migrations table to track applied migrations
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        description TEXT,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """
    )

    # Insert initial migrations as completed
    cursor.execute(
        """
    INSERT OR IGNORE INTO migrations (id, description)
    VALUES ('001_initial_schema', 'Initial database schema')
    """
    )

    # Insert test data - common commands are pre-cached
    common_commands = [
        ("ls", "ls", 1, "List directory contents", True, 100, "permanent", 10),
        ("grep", "grep", 1, "Search for patterns in files", True, 85, "permanent", 9),
        ("cd", "cd", 1, "Change directory", True, 95, "permanent", 10),
        ("cp", "cp", 1, "Copy files and directories", True, 80, "permanent", 8),
        ("mv", "mv", 1, "Move (rename) files", True, 75, "permanent", 8),
        ("rm", "rm", 1, "Remove files or directories", True, 70, "permanent", 8),
    ]

    less_common_commands = [
        ("chmod", "chmod", 1, "Change file mode bits", False, 40, "temporary", 5),
        ("chown", "chown", 1, "Change file owner and group", False, 25, "temporary", 4),
        (
            "find",
            "find",
            1,
            "Search for files in a directory hierarchy",
            False,
            50,
            "temporary",
            6,
        ),
    ]

    rare_commands = [
        (
            "strace",
            "strace",
            1,
            "Trace system calls and signals",
            False,
            10,
            "on_demand",
            2,
        ),
        ("lsof", "lsof", 8, "List open files", False, 15, "on_demand", 3),
    ]

    # Insert common commands
    for cmd in common_commands:
        cursor.execute(
            """
        INSERT OR IGNORE INTO documents 
        (name, title, section, summary, is_common, access_count, cache_status, cache_priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
            cmd,
        )

    # Insert less common commands
    for cmd in less_common_commands:
        cursor.execute(
            """
        INSERT OR IGNORE INTO documents 
        (name, title, section, summary, is_common, access_count, cache_status, cache_priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
            cmd,
        )

    # Insert rare commands
    for cmd in rare_commands:
        cursor.execute(
            """
        INSERT OR IGNORE INTO documents 
        (name, title, section, summary, is_common, access_count, cache_status, cache_priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
            cmd,
        )

    # Initialize cache management table
    cursor.execute(
        """
    INSERT OR IGNORE INTO cache_management (max_cache_size, cache_retention_days)
    VALUES (?, ?)
    """,
        (1024, 7),
    )

    # Commit changes
    conn.commit()
    conn.close()

    logger.info("Database initialized with test data for hybrid caching system")


if __name__ == "__main__":
    # Database directory is already created in the function setup
    init_db()
