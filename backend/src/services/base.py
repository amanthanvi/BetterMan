"""
Base service class with common functionality.
"""

from typing import Optional, TypeVar, Generic
from sqlalchemy.orm import Session
import logging

T = TypeVar('T')


class BaseService(Generic[T]):
    """Base service class with common functionality."""
    
    def __init__(self, db, logger=None):
        """
        Initialize base service.
        
        Args:
            db: Database session
            logger: Optional logger instance
        """
        self.db = db
        self.logger = logger or logging.getLogger(self.__class__.__name__)
    
    def commit(self) -> None:
        """Commit database transaction."""
        try:
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            self.logger.error(f"Database commit failed: {e}")
            raise
    
    def rollback(self) -> None:
        """Rollback database transaction."""
        self.db.rollback()
    
    def refresh(self, instance: T) -> T:
        """Refresh database instance."""
        self.db.refresh(instance)
        return instance