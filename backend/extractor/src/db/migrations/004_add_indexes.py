"""
Add database indexes for performance optimization.
"""

from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


def upgrade(connection):
    """Add indexes for commonly queried columns."""
    try:
        # Add indexes for search optimization
        queries = [
            # Index for name searches (most common)
            "CREATE INDEX IF NOT EXISTS idx_documents_name ON documents(name)",
            
            # Index for section filtering
            "CREATE INDEX IF NOT EXISTS idx_documents_section ON documents(section)",
            
            # Index for common documents
            "CREATE INDEX IF NOT EXISTS idx_documents_is_common ON documents(is_common)",
            
            # Composite index for name + section (common query pattern)
            "CREATE INDEX IF NOT EXISTS idx_documents_name_section ON documents(name, section)",
            
            # Index for cache management
            "CREATE INDEX IF NOT EXISTS idx_documents_cache_status ON documents(cache_status)",
            "CREATE INDEX IF NOT EXISTS idx_documents_last_accessed ON documents(last_accessed)",
            
            # Full-text search indexes (if FTS5 is available)
            # Note: These would be better implemented with FTS5 virtual tables
            "CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title)",
            "CREATE INDEX IF NOT EXISTS idx_documents_summary ON documents(summary)",
            
            # Index for sections table
            "CREATE INDEX IF NOT EXISTS idx_sections_document_id ON sections(document_id)",
            "CREATE INDEX IF NOT EXISTS idx_sections_order ON sections(document_id, \"order\")",
            
            # Index for subsections
            "CREATE INDEX IF NOT EXISTS idx_subsections_section_id ON subsections(section_id)",
            
            # Index for related documents
            "CREATE INDEX IF NOT EXISTS idx_related_document_id ON related_documents(document_id)",
            "CREATE INDEX IF NOT EXISTS idx_related_related_name ON related_documents(related_name)",
        ]
        
        for query in queries:
            connection.execute(text(query))
            
        logger.info("Successfully added performance indexes")
        
    except Exception as e:
        logger.error(f"Error adding indexes: {e}")
        raise


def downgrade(connection):
    """Remove indexes."""
    try:
        queries = [
            "DROP INDEX IF EXISTS idx_documents_name",
            "DROP INDEX IF EXISTS idx_documents_section",
            "DROP INDEX IF EXISTS idx_documents_is_common",
            "DROP INDEX IF EXISTS idx_documents_name_section",
            "DROP INDEX IF EXISTS idx_documents_cache_status",
            "DROP INDEX IF EXISTS idx_documents_last_accessed",
            "DROP INDEX IF EXISTS idx_documents_title",
            "DROP INDEX IF EXISTS idx_documents_summary",
            "DROP INDEX IF EXISTS idx_sections_document_id",
            "DROP INDEX IF EXISTS idx_sections_order",
            "DROP INDEX IF EXISTS idx_subsections_section_id",
            "DROP INDEX IF EXISTS idx_related_document_id",
            "DROP INDEX IF EXISTS idx_related_related_name",
        ]
        
        for query in queries:
            connection.execute(text(query))
            
        logger.info("Successfully removed indexes")
        
    except Exception as e:
        logger.error(f"Error removing indexes: {e}")
        raise