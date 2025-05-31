"""
User model for authentication and authorization.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, timedelta
import bcrypt
import secrets
from typing import Optional

from ..db.session import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    
    # User profile
    full_name = Column(String(255))
    bio = Column(Text)
    avatar_url = Column(String(500))
    
    # Status and permissions
    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    
    # Security
    email_verification_token = Column(String(255), unique=True)
    password_reset_token = Column(String(255), unique=True)
    password_reset_expires = Column(DateTime)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    last_login = Column(DateTime)
    
    # Rate limiting
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime)
    
    # Relationships
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")
    favorites = relationship("UserFavorite", back_populates="user", cascade="all, delete-orphan")
    search_history = relationship("SearchHistory", back_populates="user", cascade="all, delete-orphan")
    
    def verify_password(self, password: str) -> bool:
        """Verify a password against the hash."""
        return bcrypt.checkpw(password.encode('utf-8'), self.hashed_password.encode('utf-8'))
    
    def set_password(self, password: str):
        """Set password hash."""
        self.hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    def generate_email_verification_token(self) -> str:
        """Generate a unique email verification token."""
        token = secrets.urlsafe(32)
        self.email_verification_token = token
        return token
    
    def generate_password_reset_token(self) -> str:
        """Generate a unique password reset token."""
        token = secrets.urlsafe(32)
        self.password_reset_token = token
        self.password_reset_expires = datetime.utcnow() + timedelta(hours=24)
        return token
    
    def is_locked(self) -> bool:
        """Check if account is locked due to failed login attempts."""
        if self.locked_until and self.locked_until > datetime.utcnow():
            return True
        return False
    
    def increment_failed_login(self):
        """Increment failed login attempts and lock if necessary."""
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= 5:
            self.locked_until = datetime.utcnow() + timedelta(minutes=30)
    
    def reset_failed_login(self):
        """Reset failed login attempts."""
        self.failed_login_attempts = 0
        self.locked_until = None


class APIKey(Base):
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    
    # Permissions
    scopes = Column(Text)  # JSON array of allowed scopes
    rate_limit = Column(Integer, default=1000)  # Requests per hour
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime)
    
    # Usage tracking
    last_used = Column(DateTime)
    usage_count = Column(Integer, default=0, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    revoked_at = Column(DateTime)
    
    # Relationships
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="api_keys")
    
    @classmethod
    def generate_key(cls) -> str:
        """Generate a secure API key."""
        return f"bm_{secrets.urlsafe(48)}"
    
    def is_valid(self) -> bool:
        """Check if API key is valid."""
        if not self.is_active:
            return False
        if self.expires_at and self.expires_at < datetime.utcnow():
            return False
        return True
    
    def has_scope(self, scope: str) -> bool:
        """Check if API key has a specific scope."""
        if not self.scopes:
            return True  # No scopes means all access
        import json
        scopes = json.loads(self.scopes)
        return scope in scopes


class UserFavorite(Base):
    __tablename__ = "user_favorites"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    
    # Additional metadata
    notes = Column(Text)
    tags = Column(Text)  # JSON array of tags
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="favorites")
    document = relationship("Document")
    
    # Unique constraint to prevent duplicate favorites
    __table_args__ = (
        UniqueConstraint('user_id', 'document_id', name='_user_document_uc'),
    )


class SearchHistory(Base):
    __tablename__ = "search_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Search details
    query = Column(String(500), nullable=False)
    section = Column(Integer)
    results_count = Column(Integer)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="search_history")


