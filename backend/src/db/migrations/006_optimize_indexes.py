"""
Database migration: Optimize indexes for better query performance.
"""

from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


def upgrade(db):
    """Add optimized indexes for common queries."""
    try:
        # Create composite indexes for common query patterns
        indexes = [
            # Documents table indexes
            "CREATE INDEX IF NOT EXISTS idx_documents_name_section ON documents(name, section)",
            "CREATE INDEX IF NOT EXISTS idx_documents_category_section ON documents(category, section)",
            "CREATE INDEX IF NOT EXISTS idx_documents_access_count ON documents(access_count DESC)",
            "CREATE INDEX IF NOT EXISTS idx_documents_cache_status ON documents(cache_status)",
            "CREATE INDEX IF NOT EXISTS idx_documents_is_common ON documents(is_common)",
            "CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC)",
            
            # Sections table indexes
            "CREATE INDEX IF NOT EXISTS idx_sections_document_order ON sections(document_id, \"order\")",
            
            # Users table indexes (if authentication is used)
            "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
            "CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)",
            
            # Search optimization indexes
            "CREATE INDEX IF NOT EXISTS idx_documents_title_trgm ON documents USING gin(title gin_trgm_ops)",
            "CREATE INDEX IF NOT EXISTS idx_documents_summary_trgm ON documents USING gin(summary gin_trgm_ops)",
            
            # Full-text search indexes
            "CREATE INDEX IF NOT EXISTS idx_documents_search_vector ON documents USING gin(to_tsvector('english', name || ' ' || COALESCE(title, '') || ' ' || COALESCE(summary, '')))"
        ]
        
        # Check if pg_trgm extension is available (for fuzzy search)
        try:
            db.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
            logger.info("pg_trgm extension enabled for fuzzy search")
        except Exception as e:
            logger.warning(f"Could not enable pg_trgm extension: {e}")
            # Remove trigram indexes if extension not available
            indexes = [idx for idx in indexes if 'trgm' not in idx]
        
        # Create indexes
        for index_sql in indexes:
            try:
                db.execute(text(index_sql))
                logger.info(f"Created index: {index_sql.split('idx_')[1].split(' ')[0]}")
            except Exception as e:
                logger.error(f"Failed to create index: {e}")
        
        # Analyze tables for query planner
        tables = ['documents', 'sections', 'users']
        for table in tables:
            try:
                db.execute(text(f"ANALYZE {table}"))
                logger.info(f"Analyzed table: {table}")
            except Exception:
                pass  # SQLite doesn't support ANALYZE in same way
        
        db.commit()
        logger.info("Database indexes optimized successfully")
        
    except Exception as e:
        logger.error(f"Failed to optimize indexes: {e}")
        db.rollback()
        raise


def downgrade(db):
    """Remove optimization indexes."""
    try:
        indexes = [
            "idx_documents_name_section",
            "idx_documents_category_section",
            "idx_documents_access_count",
            "idx_documents_cache_status",
            "idx_documents_is_common",
            "idx_documents_created_at",
            "idx_sections_document_order",
            "idx_users_email",
            "idx_users_is_active",
            "idx_documents_title_trgm",
            "idx_documents_summary_trgm",
            "idx_documents_search_vector"
        ]
        
        for index_name in indexes:
            try:
                db.execute(text(f"DROP INDEX IF EXISTS {index_name}"))
                logger.info(f"Dropped index: {index_name}")
            except Exception as e:
                logger.error(f"Failed to drop index {index_name}: {e}")
        
        db.commit()
        logger.info("Optimization indexes removed")
        
    except Exception as e:
        logger.error(f"Failed to remove indexes: {e}")
        db.rollback()
        raise