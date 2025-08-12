"""Migration to add cache_status column to documents table."""

import logging
from sqlalchemy import text

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def migrate(db_session):
    """Add cache_status column to documents table.

    Args:
        db_session: SQLAlchemy database session
    """
    try:
        # Check if column already exists to avoid errors
        result = db_session.execute(
            text(
                """
            SELECT COUNT(*) FROM pragma_table_info('documents') 
            WHERE name = 'cache_status'
        """
            )
        ).scalar()

        if result == 0:
            # Column doesn't exist, add it
            logger.info("Adding cache_status column to documents table")
            db_session.execute(
                text(
                    """
                ALTER TABLE documents 
                ADD COLUMN cache_status TEXT DEFAULT 'on_demand'
            """
                )
            )

            # Add index for the new column
            db_session.execute(
                text(
                    """
                CREATE INDEX IF NOT EXISTS idx_document_cache_status 
                ON documents(cache_status)
            """
                )
            )

            # Update existing documents to have a proper cache_status
            # Set common commands to 'permanent'
            db_session.execute(
                text(
                    """
                UPDATE documents 
                SET cache_status = 'permanent' 
                WHERE is_common = 1
            """
                )
            )

            db_session.commit()
            logger.info("Successfully added cache_status column")
        else:
            logger.info("cache_status column already exists")

    except Exception as e:
        db_session.rollback()
        logger.error(f"Error adding cache_status column: {str(e)}")
        raise
