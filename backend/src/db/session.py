"""Database session management for BetterMan."""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path

# Get database URL from environment variable, or use a default value
DATABASE_DIR = Path(__file__).parent.parent.parent / "data"
DATABASE_DIR.mkdir(exist_ok=True)
DATABASE_PATH = DATABASE_DIR / "betterman.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATABASE_PATH}")

print(f"Using database at: {DATABASE_URL}")

# For SQLite, add check_same_thread=False
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=True,  # Enable SQL logging for debugging
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for models
Base = declarative_base()


# Dependency to get DB session
def get_db():
    """
    Get a database session.

    Yields:
        Session: A SQLAlchemy session.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
