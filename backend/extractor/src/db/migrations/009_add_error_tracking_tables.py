"""Add error tracking and system health tables."""

from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)


def upgrade(db: Session):
    """Create error tracking and system health tables."""
    try:
        # Create error_reports table
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS error_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                error_id VARCHAR(128) UNIQUE NOT NULL,
                user_id INTEGER,
                error_type VARCHAR(100) NOT NULL,
                error_message TEXT NOT NULL,
                stack_trace TEXT,
                severity VARCHAR(20) NOT NULL,
                source VARCHAR(50) NOT NULL,
                endpoint VARCHAR(255),
                user_agent TEXT,
                context_data TEXT,  -- JSON
                environment_data TEXT,  -- JSON
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP,
                resolution_notes TEXT
            )
        """))
        
        # Create indexes for error_reports
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_error_reports_error_id ON error_reports(error_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_error_reports_error_type ON error_reports(error_type)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_error_reports_severity ON error_reports(severity)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_error_reports_created_at ON error_reports(created_at)"))
        
        # Create error_feedback table
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS error_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                error_id VARCHAR(128) NOT NULL,
                user_id INTEGER,
                feedback TEXT NOT NULL,
                contact_allowed BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (error_id) REFERENCES error_reports(error_id) ON DELETE CASCADE
            )
        """))
        
        # Create system_health table
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS system_health (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_name VARCHAR(100) NOT NULL,
                metric_value REAL NOT NULL,
                metric_unit VARCHAR(50),
                threshold_warning REAL,
                threshold_critical REAL,
                status VARCHAR(20),
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        
        # Create indexes for system_health
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_system_health_metric_name ON system_health(metric_name)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_system_health_recorded_at ON system_health(recorded_at)"))
        
        db.commit()
        logger.info("Successfully created error tracking tables")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create error tracking tables: {e}")
        raise


def downgrade(db: Session):
    """Drop error tracking tables."""
    try:
        db.execute(text("DROP TABLE IF EXISTS error_feedback"))
        db.execute(text("DROP TABLE IF EXISTS error_reports"))
        db.execute(text("DROP TABLE IF EXISTS system_health"))
        db.commit()
        logger.info("Successfully dropped error tracking tables")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to drop error tracking tables: {e}")
        raise