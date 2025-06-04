"""
Simple script to populate the database with test data using direct SQL.
"""

import sqlite3
import os
from datetime import datetime

# Database path
db_path = "/app/data/betterman.db"

# Test data
TEST_COMMANDS = [
    ("ls", "ls - list directory contents", 1, "List information about the FILEs", """LS(1)                            User Commands                           LS(1)

NAME
       ls - list directory contents

SYNOPSIS
       ls [OPTION]... [FILE]...

DESCRIPTION
       List  information  about  the FILEs (the current directory by default).
       Sort entries alphabetically if none of -cftuvSUX nor --sort  is  specified.""", 
     True, 100, "permanent", 10),
    ("cd", "cd - change directory", 1, "Change the shell working directory", """CD(1)                            User Commands                           CD(1)

NAME
       cd - change directory

SYNOPSIS
       cd [directory]

DESCRIPTION
       Change the current directory to directory.""",
     True, 95, "permanent", 10),
    ("grep", "grep - print lines matching a pattern", 1, "Search for PATTERN in each FILE", """GREP(1)                          User Commands                         GREP(1)

NAME
       grep, egrep, fgrep - print lines matching a pattern

SYNOPSIS
       grep [OPTIONS] PATTERN [FILE...]""",
     True, 85, "permanent", 9)
]

def populate():
    """Populate database with test data."""
    # Create data directory if it doesn't exist
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if documents table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'")
        if not cursor.fetchone():
            print("Documents table doesn't exist. Creating tables...")
            # Create tables
            cursor.execute("""
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
                    cache_status TEXT DEFAULT 'on_demand',
                    cache_priority INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        
        # Check if we already have data
        cursor.execute("SELECT COUNT(*) FROM documents")
        count = cursor.fetchone()[0]
        if count > 0:
            print(f"Database already contains {count} documents")
            return
        
        # Insert test data
        for cmd in TEST_COMMANDS:
            cursor.execute("""
                INSERT INTO documents (name, title, section, summary, raw_content, 
                                     is_common, access_count, cache_status, cache_priority)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, cmd)
        
        conn.commit()
        print(f"Successfully inserted {len(TEST_COMMANDS)} test documents")
        
        # Verify
        cursor.execute("SELECT name FROM documents")
        docs = cursor.fetchall()
        print("Documents in database:", [doc[0] for doc in docs])
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    populate()