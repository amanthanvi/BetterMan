#!/usr/bin/env python3
"""Initialize PostgreSQL database with BetterMan schema and data."""

import os
import sys
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timedelta
import json
import uuid

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.db.postgres_connection import init_db, engine, get_db
from src.models.postgres_models import (
    Base, ManPage, Category, PopularCommand, 
    CacheMetadata, UserPreference
)
from sqlalchemy.orm import Session
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_initial_categories(db: Session):
    """Create initial command categories."""
    categories = [
        {
            "name": "File Management",
            "slug": "file-management",
            "description": "Commands for managing files and directories",
            "icon": "📁",
            "color": "#3B82F6",
            "order": 1
        },
        {
            "name": "Process Management",
            "slug": "process-management",
            "description": "Commands for managing system processes",
            "icon": "⚙️",
            "color": "#10B981",
            "order": 2
        },
        {
            "name": "Network",
            "slug": "network",
            "description": "Network and connectivity commands",
            "icon": "🌐",
            "color": "#8B5CF6",
            "order": 3
        },
        {
            "name": "Text Processing",
            "slug": "text-processing",
            "description": "Commands for processing and manipulating text",
            "icon": "📝",
            "color": "#F59E0B",
            "order": 4
        },
        {
            "name": "System Administration",
            "slug": "system-admin",
            "description": "System administration and configuration",
            "icon": "🛠",
            "color": "#EF4444",
            "order": 5
        },
        {
            "name": "Development Tools",
            "slug": "dev-tools",
            "description": "Development and programming tools",
            "icon": "💻",
            "color": "#6366F1",
            "order": 6
        }
    ]
    
    for cat_data in categories:
        category = Category(**cat_data)
        db.add(category)
    
    db.commit()
    logger.info(f"Created {len(categories)} categories")


def load_sample_man_pages(db: Session):
    """Load sample man pages for testing."""
    sample_pages = [
        {
            "name": "ls",
            "section": "1",
            "title": "list directory contents",
            "description": "List information about files and directories",
            "synopsis": "ls [OPTION]... [FILE]...",
            "category": "file-management",
            "is_common": True,
            "content": {
                "sections": [
                    {
                        "name": "DESCRIPTION",
                        "content": "List information about the FILEs (the current directory by default)."
                    },
                    {
                        "name": "OPTIONS",
                        "content": "-a, --all: do not ignore entries starting with .\n-l: use a long listing format"
                    }
                ]
            },
            "related_commands": ["dir", "vdir", "find", "tree"],
            "metadata": {"complexity": "basic", "usage_frequency": "very_high"}
        },
        {
            "name": "grep",
            "section": "1",
            "title": "print lines matching a pattern",
            "description": "Search for patterns in files",
            "synopsis": "grep [OPTIONS] PATTERN [FILE...]",
            "category": "text-processing",
            "is_common": True,
            "content": {
                "sections": [
                    {
                        "name": "DESCRIPTION",
                        "content": "grep searches for PATTERN in each FILE."
                    },
                    {
                        "name": "OPTIONS",
                        "content": "-i: ignore case\n-r: recursive search\n-n: show line numbers"
                    }
                ]
            },
            "related_commands": ["egrep", "fgrep", "sed", "awk"],
            "metadata": {"complexity": "intermediate", "usage_frequency": "high"}
        },
        {
            "name": "ps",
            "section": "1",
            "title": "report process status",
            "description": "Display information about running processes",
            "synopsis": "ps [OPTIONS]",
            "category": "process-management",
            "is_common": True,
            "content": {
                "sections": [
                    {
                        "name": "DESCRIPTION",
                        "content": "ps displays information about a selection of active processes."
                    },
                    {
                        "name": "OPTIONS",
                        "content": "-e: show all processes\n-f: full format listing\n-u: user-oriented format"
                    }
                ]
            },
            "related_commands": ["top", "htop", "pgrep", "kill"],
            "metadata": {"complexity": "basic", "usage_frequency": "high"}
        }
    ]
    
    for page_data in sample_pages:
        page = ManPage(**page_data)
        db.add(page)
    
    db.commit()
    logger.info(f"Loaded {len(sample_pages)} sample man pages")


def create_indexes(db: Session):
    """Create additional database indexes for performance."""
    indexes = [
        # Composite indexes for common queries
        "CREATE INDEX IF NOT EXISTS idx_man_page_name_lower ON man_pages (LOWER(name))",
        "CREATE INDEX IF NOT EXISTS idx_man_page_category_common ON man_pages (category, is_common)",
        
        # Partial indexes for filtered queries
        "CREATE INDEX IF NOT EXISTS idx_man_page_common_only ON man_pages (name, section) WHERE is_common = true",
        
        # Expression indexes
        "CREATE INDEX IF NOT EXISTS idx_man_page_name_trgm ON man_pages USING gin (name gin_trgm_ops)",
        
        # BRIN index for time-series data
        "CREATE INDEX IF NOT EXISTS idx_search_history_created_brin ON search_history USING brin (created_at)",
    ]
    
    for index_sql in indexes:
        try:
            db.execute(text(index_sql))
            db.commit()
            logger.info(f"Created index: {index_sql.split('idx_')[1].split(' ')[0]}")
        except Exception as e:
            logger.warning(f"Index creation skipped (may already exist): {e}")
            db.rollback()


def setup_extensions(db: Session):
    """Setup PostgreSQL extensions."""
    extensions = [
        "CREATE EXTENSION IF NOT EXISTS pg_trgm",  # For fuzzy text search
        "CREATE EXTENSION IF NOT EXISTS btree_gin",  # For composite GIN indexes
        "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"",  # For UUID generation
    ]
    
    for ext_sql in extensions:
        try:
            db.execute(text(ext_sql))
            db.commit()
            logger.info(f"Created extension: {ext_sql.split('EXISTS ')[1]}")
        except Exception as e:
            logger.warning(f"Extension setup skipped: {e}")
            db.rollback()


def initialize_cache_metadata(db: Session):
    """Initialize cache metadata entries."""
    cache_entries = [
        {
            "cache_key": "popular_commands_daily",
            "cache_type": "aggregate",
            "ttl_seconds": 3600,
            "expires_at": datetime.utcnow() + timedelta(hours=1)
        },
        {
            "cache_key": "popular_commands_weekly",
            "cache_type": "aggregate",
            "ttl_seconds": 86400,
            "expires_at": datetime.utcnow() + timedelta(days=1)
        },
        {
            "cache_key": "category_stats",
            "cache_type": "aggregate",
            "ttl_seconds": 7200,
            "expires_at": datetime.utcnow() + timedelta(hours=2)
        }
    ]
    
    for entry_data in cache_entries:
        entry = CacheMetadata(**entry_data)
        db.add(entry)
    
    db.commit()
    logger.info(f"Initialized {len(cache_entries)} cache metadata entries")


def main():
    """Main initialization function."""
    logger.info("Starting PostgreSQL database initialization...")
    
    try:
        # Initialize database schema
        logger.info("Creating database schema...")
        init_db()
        
        # Get database session
        db = next(get_db())
        
        # Setup PostgreSQL extensions (if using PostgreSQL)
        if 'postgresql' in str(engine.url):
            logger.info("Setting up PostgreSQL extensions...")
            setup_extensions(db)
        
        # Create initial data
        logger.info("Creating initial categories...")
        create_initial_categories(db)
        
        logger.info("Loading sample man pages...")
        load_sample_man_pages(db)
        
        logger.info("Creating performance indexes...")
        create_indexes(db)
        
        logger.info("Initializing cache metadata...")
        initialize_cache_metadata(db)
        
        # Verify setup
        page_count = db.query(ManPage).count()
        category_count = db.query(Category).count()
        
        logger.info(f"""
        ✅ Database initialization complete!
        - Man pages: {page_count}
        - Categories: {category_count}
        - Database: {engine.url.database}
        - Environment: {os.environ.get('ENVIRONMENT', 'development')}
        """)
        
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()