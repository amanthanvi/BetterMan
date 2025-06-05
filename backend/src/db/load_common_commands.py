#!/usr/bin/env python3
"""
Load common Unix commands into the database.
"""

import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent.parent))

from src.db.session import SessionLocal, init_db
from src.models.document import Document
from src.cache.cache_manager import CacheManager
from src.parser.linux_parser import LinuxManParser

# Common commands to load
COMMON_COMMANDS = [
    "ls", "cd", "pwd", "cat", "grep", "find", "echo", "mkdir", "rm", "cp", "mv",
    "chmod", "chown", "ps", "kill", "top", "df", "du", "tar", "gzip", "ssh",
    "scp", "rsync", "wget", "curl", "git", "vim", "nano", "sed", "awk", "sort",
    "uniq", "head", "tail", "less", "more", "man", "which", "whereis", "locate",
    "date", "cal", "history", "alias", "export", "source", "bash", "sh", "env"
]

def load_common_commands():
    """Load common Unix commands into the database."""
    init_db()
    db = SessionLocal()
    parser = LinuxManParser()
    cache_manager = CacheManager(db, parser)
    
    loaded_count = 0
    failed_count = 0
    
    print(f"Loading {len(COMMON_COMMANDS)} common commands...")
    
    for cmd in COMMON_COMMANDS:
        # Check if already exists
        existing = db.query(Document).filter(Document.name == cmd).first()
        if existing:
            print(f"✓ {cmd} already exists")
            continue
        
        try:
            # Try to load the command
            document = cache_manager.process_and_cache(cmd)
            if document:
                print(f"✓ Loaded {cmd}")
                loaded_count += 1
            else:
                print(f"✗ Failed to load {cmd} - not found")
                failed_count += 1
        except Exception as e:
            print(f"✗ Error loading {cmd}: {e}")
            failed_count += 1
    
    db.close()
    
    print(f"\nSummary:")
    print(f"  Loaded: {loaded_count}")
    print(f"  Failed: {failed_count}")
    print(f"  Already existed: {len(COMMON_COMMANDS) - loaded_count - failed_count}")

if __name__ == "__main__":
    load_common_commands()