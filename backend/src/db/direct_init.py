"""Direct database initialization with test data."""

import sqlite3
import os
from pathlib import Path

# Get the absolute path for the data directory
data_dir = Path(__file__).parent.parent.parent / "data"
data_dir.mkdir(exist_ok=True)
db_path = data_dir / "betterman.db"

print(f"Database path: {db_path}")


def init_db():
    """Initialize an in-memory SQLite database with test data."""
    # Use in-memory database for simplicity
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

    # Insert test data
    cursor.execute(
        """
    INSERT OR IGNORE INTO documents (name, title, section, summary, is_common, access_count)
    VALUES (?, ?, ?, ?, ?, ?)
    """,
        ("ls", "ls", 1, "List directory contents", True, 0),
    )

    cursor.execute(
        """
    INSERT OR IGNORE INTO documents (name, title, section, summary, is_common, access_count)
    VALUES (?, ?, ?, ?, ?, ?)
    """,
        ("grep", "grep", 1, "Search for patterns in files", True, 0),
    )

    cursor.execute(
        """
    INSERT OR IGNORE INTO documents (name, title, section, summary, is_common, access_count)
    VALUES (?, ?, ?, ?, ?, ?)
    """,
        ("cd", "cd", 1, "Change directory", True, 0),
    )

    # Commit changes
    conn.commit()
    conn.close()

    print("Database initialized with test data")


if __name__ == "__main__":
    # Database directory is already created in the function setup
    init_db()
