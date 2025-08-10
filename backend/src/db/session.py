"""Database session management for BetterMan."""

import logging
from contextlib import contextmanager
from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session, Session
from sqlalchemy.pool import QueuePool, NullPool

from ..config import get_settings, get_database_config

logger = logging.getLogger(__name__)

# Get settings
settings = get_settings()

# Create engine with appropriate configuration
if settings.DATABASE_URL.startswith("sqlite"):
    # SQLite doesn't support connection pooling well
    engine = create_engine(
        settings.DATABASE_URL,
        poolclass=NullPool,
        connect_args={"check_same_thread": False, "timeout": 30}
    )
else:
    # Use connection pooling for PostgreSQL with psycopg3
    database_url = settings.DATABASE_URL
    # Convert to psycopg3 format if needed
    if database_url.startswith('postgresql://') and '+' not in database_url:
        database_url = database_url.replace('postgresql://', 'postgresql+psycopg://')
    
    engine = create_engine(
        database_url,
        poolclass=QueuePool,
        **get_database_config(settings)
    )

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create thread-safe scoped session
ScopedSession = scoped_session(SessionLocal)

# Create base class for SQLAlchemy models
Base = declarative_base()


# Add SQLite-specific optimizations
if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        """Set SQLite pragmas for better performance."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=10000")
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.execute("PRAGMA mmap_size=30000000000")
        cursor.close()


def init_db():
    """Initialize the database schema and run migrations."""
    from ..models.document import Base

    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")

    # Run migrations
    from .migrations import DatabaseMigration

    with SessionLocal() as db:
        migrations = DatabaseMigration(db)
        migrations.run_migrations()
        logger.info("Database migrations completed")


def get_db():
    """
    Get a database session.
    
    Yields:
        SQLAlchemy session
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def get_db_context():
    """
    Context manager for database sessions.
    
    Usage:
        with get_db_context() as db:
            # Use db session
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception as e:
        logger.error(f"Database error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def get_scoped_db() -> Session:
    """
    Get a thread-safe scoped database session.
    
    Returns:
        Scoped SQLAlchemy session
    """
    return ScopedSession()


def remove_scoped_db():
    """Remove the current scoped session."""
    ScopedSession.remove()
