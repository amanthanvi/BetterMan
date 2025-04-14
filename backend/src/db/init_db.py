"""Database initialization script."""

import os
import sys
from pathlib import Path

# Add the parent directory to Python path to allow imports from src
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

from src.db.session import engine, Base
from src.models.document import Document, Section, Subsection, RelatedDocument


def init_db():
    """Initialize database by creating all tables."""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully.")


if __name__ == "__main__":
    init_db()
