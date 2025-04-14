"""Database session management for BetterMan."""

import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get database URL from environment variable or use default
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./data/betterman.db")

# Create engine
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}  # Only needed for SQLite
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for SQLAlchemy models
Base = declarative_base()


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
    """Get a database session.

    Yields:
        SQLAlchemy session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
