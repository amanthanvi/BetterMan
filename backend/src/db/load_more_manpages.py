#!/usr/bin/env python3
"""
Script to load more man pages using the CacheManager.
"""

import os
import sys
from pathlib import Path

# Add the parent directory to Python path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session
from src.db.session import engine, get_db
from src.models.document import Document, Base
from src.cache.cache_manager import CacheManager
from src.parser.linux_parser import LinuxManParser
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Additional commands to load
ADDITIONAL_COMMANDS = [
    # Core utilities
    "cat", "echo", "pwd", "mkdir", "rmdir", "rm", "cp", "mv", "ln",
    "chmod", "chown", "touch", "find", "which", "whereis", "date",
    
    # Text processing
    "head", "tail", "less", "more", "sort", "uniq", "cut", "awk", "sed",
    
    # File utilities
    "tar", "gzip", "zip", "unzip", "diff", "wc", "file", "stat",
    
    # Network utilities
    "curl", "wget", "ping", "ssh", "scp", "rsync",
    
    # Development tools
    "git", "vim", "nano", "make", "gcc", "python", "python3",
    
    # System utilities
    "ps", "top", "kill", "df", "du", "free", "uname", "whoami", "id",
]


def load_more_manpages():
    """Load more man pages into the database."""
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    # Get database session
    db = next(get_db())
    parser = LinuxManParser()
    cache_manager = CacheManager(db, parser)
    
    try:
        # Get existing documents
        existing_names = {doc.name for doc in db.query(Document.name).all()}
        logger.info(f"Found {len(existing_names)} existing documents in database")
        
        loaded_count = 0
        error_count = 0
        
        for cmd in ADDITIONAL_COMMANDS:
            if cmd in existing_names:
                logger.debug(f"Skipping {cmd} - already exists")
                continue
            
            try:
                logger.info(f"Loading man page for: {cmd}")
                
                # Use CacheManager to process and cache the document
                document = cache_manager.process_and_cache(cmd)
                
                if document:
                    loaded_count += 1
                    logger.info(f"Successfully loaded: {cmd}")
                else:
                    error_count += 1
                    logger.warning(f"Failed to load: {cmd}")
                
            except Exception as e:
                logger.error(f"Error loading {cmd}: {e}")
                error_count += 1
                continue
        
        # Final statistics
        total_docs = db.query(Document).count()
        logger.info(f"\nLoading complete!")
        logger.info(f"Successfully loaded: {loaded_count} new documents")
        logger.info(f"Errors: {error_count}")
        logger.info(f"Total documents in database: {total_docs}")
        
        # Show some sample documents
        logger.info("\nSample documents in database:")
        samples = db.query(Document).limit(10).all()
        for doc in samples:
            logger.info(f"  - {doc.name}.{doc.section}: {doc.title}")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error loading man pages: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    load_more_manpages()