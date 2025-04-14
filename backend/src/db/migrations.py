"""Database migration utilities for BetterMan."""

import logging
from sqlalchemy import text
from typing import List, Dict, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DatabaseMigration:
    """Handles database migrations and setup."""

    def __init__(self, db_session):
        """Initialize migration handler.

        Args:
            db_session: SQLAlchemy database session
        """
        self.db = db_session

    def run_migrations(self):
        """Run all pending migrations."""
        try:
            # Create migration tracking table if it doesn't exist
            self._create_migration_table()

            # Get completed migrations
            completed = self._get_completed_migrations()

            # Define migrations
            migrations = [
                {
                    "id": "001_initial_schema",
                    "description": "Initial database schema",
                    "run": self._migration_001_initial_schema,
                },
                {
                    "id": "002_add_cache_status",
                    "description": "Add cache_status column to documents table",
                    "run": self._migration_002_add_cache_status,
                },
                {
                    "id": "003_add_cache_priority",
                    "description": "Add cache_priority column to documents table",
                    "run": self._migration_003_add_cache_priority,
                },
                {
                    "id": "004_add_fts_tables",
                    "description": "Add full-text search tables",
                    "run": self._migration_004_add_fts_tables,
                },
            ]

            # Run pending migrations
            for migration in migrations:
                if migration["id"] not in completed:
                    logger.info(
                        f"Running migration: {migration['id']} - {migration['description']}"
                    )
                    migration["run"]()
                    self._mark_migration_complete(
                        migration["id"], migration["description"]
                    )
                    logger.info(f"Migration {migration['id']} completed successfully")

        except Exception as e:
            logger.error(f"Migration error: {str(e)}")
            raise

    def _create_migration_table(self):
        """Create the migration tracking table if it doesn't exist."""
        try:
            self.db.execute(
                text(
                    """
                CREATE TABLE IF NOT EXISTS migrations (
                    id TEXT PRIMARY KEY,
                    description TEXT,
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """
                )
            )
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating migration table: {str(e)}")
            raise

    def _get_completed_migrations(self) -> List[str]:
        """Get list of completed migrations.

        Returns:
            List of completed migration IDs
        """
        try:
            result = self.db.execute(text("SELECT id FROM migrations"))
            return [row[0] for row in result]
        except Exception as e:
            logger.error(f"Error getting completed migrations: {str(e)}")
            return []

    def _mark_migration_complete(self, migration_id: str, description: str):
        """Mark a migration as complete.

        Args:
            migration_id: Migration identifier
            description: Migration description
        """
        try:
            self.db.execute(
                text("INSERT INTO migrations (id, description) VALUES (:id, :desc)"),
                {"id": migration_id, "desc": description},
            )
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error marking migration complete: {str(e)}")
            raise

    def _migration_001_initial_schema(self):
        """Initial database schema migration."""
        # This migration is a no-op since the base tables are created by SQLAlchemy
        pass

    def _migration_002_add_cache_status(self):
        """Add cache_status column to documents table."""
        try:
            # Check if column already exists
            result = self.db.execute(
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
                self.db.execute(
                    text(
                        """
                    ALTER TABLE documents 
                    ADD COLUMN cache_status TEXT DEFAULT 'on_demand'
                """
                    )
                )

                # Add index for the new column
                self.db.execute(
                    text(
                        """
                    CREATE INDEX IF NOT EXISTS idx_document_cache_status 
                    ON documents(cache_status)
                """
                    )
                )

                # Update existing documents to have a proper cache_status
                # Set common commands to 'permanent'
                self.db.execute(
                    text(
                        """
                    UPDATE documents 
                    SET cache_status = 'permanent' 
                    WHERE is_common = 1
                """
                    )
                )

                self.db.commit()
                logger.info("Successfully added cache_status column")
            else:
                logger.info("cache_status column already exists")

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error adding cache_status column: {str(e)}")
            raise

    def _migration_003_add_cache_priority(self):
        """Add cache_priority column to documents table."""
        try:
            # Check if column already exists
            result = self.db.execute(
                text(
                    """
                SELECT COUNT(*) FROM pragma_table_info('documents') 
                WHERE name = 'cache_priority'
            """
                )
            ).scalar()

            if result == 0:
                # Column doesn't exist, add it
                logger.info("Adding cache_priority column to documents table")
                self.db.execute(
                    text(
                        """
                    ALTER TABLE documents 
                    ADD COLUMN cache_priority INTEGER DEFAULT 0
                """
                    )
                )

                # Update existing documents to have proper priorities
                # Set high priority for common commands
                self.db.execute(
                    text(
                        """
                    UPDATE documents 
                    SET cache_priority = 10 
                    WHERE is_common = 1
                """
                    )
                )

                # Set medium priority for documents with high access count
                self.db.execute(
                    text(
                        """
                    UPDATE documents 
                    SET cache_priority = 5 
                    WHERE is_common = 0 AND access_count > 50
                """
                    )
                )

                self.db.commit()
                logger.info("Successfully added cache_priority column")
            else:
                logger.info("cache_priority column already exists")

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error adding cache_priority column: {str(e)}")
            raise

    def _migration_004_add_fts_tables(self):
        """Add full-text search tables."""
        try:
            # Check if SQLite has FTS5 support
            result = self.db.execute(text("SELECT sqlite_source_id()")).scalar()
            if "fts5" not in result.lower():
                logger.warning(
                    "SQLite FTS5 extension not available, skipping FTS tables"
                )
                return

            # Create document content FTS virtual table
            self.db.execute(
                text(
                    """
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_documents USING fts5(
                    name,
                    title,
                    summary,
                    content,
                    section,
                    tokenize='porter unicode61'
                );
            """
                )
            )

            # Create sections FTS virtual table
            self.db.execute(
                text(
                    """
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_sections USING fts5(
                    document_id,
                    section_name,
                    section_content,
                    tokenize='porter unicode61'
                );
            """
                )
            )

            # Add triggers to keep FTS tables in sync with main tables

            # Document insert trigger
            self.db.execute(
                text(
                    """
                CREATE TRIGGER IF NOT EXISTS trig_documents_insert AFTER INSERT ON documents
                BEGIN
                    INSERT INTO fts_documents(rowid, name, title, summary, content, section)
                    VALUES (
                        new.id,
                        new.name,
                        new.title,
                        new.summary,
                        new.raw_content,
                        new.section
                    );
                END;
            """
                )
            )

            # Document update trigger
            self.db.execute(
                text(
                    """
                CREATE TRIGGER IF NOT EXISTS trig_documents_update AFTER UPDATE ON documents
                BEGIN
                    DELETE FROM fts_documents WHERE rowid = old.id;
                    INSERT INTO fts_documents(rowid, name, title, summary, content, section)
                    VALUES (
                        new.id,
                        new.name,
                        new.title,
                        new.summary,
                        new.raw_content,
                        new.section
                    );
                END;
            """
                )
            )

            # Document delete trigger
            self.db.execute(
                text(
                    """
                CREATE TRIGGER IF NOT EXISTS trig_documents_delete AFTER DELETE ON documents
                BEGIN
                    DELETE FROM fts_documents WHERE rowid = old.id;
                END;
            """
                )
            )

            # Section insert trigger
            self.db.execute(
                text(
                    """
                CREATE TRIGGER IF NOT EXISTS trig_sections_insert AFTER INSERT ON sections
                BEGIN
                    INSERT INTO fts_sections(document_id, section_name, section_content)
                    VALUES (
                        new.document_id,
                        new.name,
                        new.content
                    );
                END;
            """
                )
            )

            # Section update trigger
            self.db.execute(
                text(
                    """
                CREATE TRIGGER IF NOT EXISTS trig_sections_update AFTER UPDATE ON sections
                BEGIN
                    DELETE FROM fts_sections WHERE rowid = old.id;
                    INSERT INTO fts_sections(document_id, section_name, section_content)
                    VALUES (
                        new.document_id,
                        new.name,
                        new.content
                    );
                END;
            """
                )
            )

            # Section delete trigger
            self.db.execute(
                text(
                    """
                CREATE TRIGGER IF NOT EXISTS trig_sections_delete AFTER DELETE ON sections
                BEGIN
                    DELETE FROM fts_sections WHERE rowid = old.id;
                END;
            """
                )
            )

            self.db.commit()
            logger.info("FTS tables and triggers created successfully")

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating FTS tables: {str(e)}")
            raise
