"""Enhanced session management with proper error handling and cleanup."""

import logging
from contextlib import contextmanager
from typing import Generator
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)


@contextmanager
def safe_session(session: Session) -> Generator[Session, None, None]:
    """
    Context manager for safe session handling with automatic rollback on errors.
    
    Usage:
        with safe_session(db) as session:
            # Your database operations
            session.add(obj)
            session.commit()
    """
    try:
        yield session
    except SQLAlchemyError as e:
        logger.error(f"Database error occurred: {e}")
        session.rollback()
        raise
    except Exception as e:
        logger.error(f"Unexpected error in database operation: {e}")
        session.rollback()
        raise
    finally:
        # Ensure the session is clean for next use
        if session.is_active:
            session.rollback()


def get_db_with_cleanup():
    """
    Enhanced database session provider with proper cleanup.
    """
    from .postgres_connection import SessionLocal
    
    db = SessionLocal()
    try:
        # Begin a new transaction explicitly
        db.begin()
        yield db
        # If we get here without exception, commit
        if db.is_active:
            db.commit()
    except Exception as e:
        # Rollback on any error
        if db.is_active:
            db.rollback()
        logger.error(f"Database session error: {e}")
        raise
    finally:
        # Always close the session
        db.close()


def reset_failed_session(session: Session) -> Session:
    """
    Reset a session that's in a failed state.
    
    Args:
        session: The failed session
        
    Returns:
        A fresh session ready for use
    """
    try:
        # Try to rollback the failed transaction
        session.rollback()
    except Exception:
        # If rollback fails, the session is unusable
        pass
    finally:
        # Close the old session
        session.close()
    
    # Create a new session
    from .postgres_connection import SessionLocal
    return SessionLocal()