"""
OAuth provider models for third-party authentication.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum

from ..db.session import Base


class OAuthProvider(enum.Enum):
    """Supported OAuth providers."""
    GITHUB = "github"
    GOOGLE = "google"
    GITLAB = "gitlab"


class OAuthAccount(Base):
    """OAuth account linked to a user."""
    __tablename__ = "oauth_accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    provider = Column(Enum(OAuthProvider), nullable=False)
    provider_account_id = Column(String(255), nullable=False)
    
    # OAuth tokens
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text)
    token_type = Column(String(50))
    expires_at = Column(DateTime)
    
    # Provider-specific data
    provider_data = Column(Text)  # JSON data from provider
    
    # User relationship
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="oauth_accounts")
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    last_used = Column(DateTime)
    
    # Unique constraint for provider + account ID
    __table_args__ = (
        UniqueConstraint('provider', 'provider_account_id', name='unique_provider_account'),
    )


class UserSession(Base):
    """User session for device tracking and management."""
    __tablename__ = "user_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), unique=True, index=True, nullable=False)
    
    # Session info
    device_name = Column(String(255))
    device_type = Column(String(50))  # desktop, mobile, tablet
    browser = Column(String(100))
    os = Column(String(100))
    ip_address = Column(String(45))  # IPv6 compatible
    location = Column(String(255))  # City, Country
    
    # Security
    is_active = Column(Boolean, default=True, nullable=False)
    last_activity = Column(DateTime, server_default=func.now(), nullable=False)
    
    # User relationship
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="sessions")
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    
    def is_expired(self) -> bool:
        """Check if session is expired."""
        return self.expires_at < datetime.utcnow()


class TwoFactorAuth(Base):
    """Two-factor authentication settings for users."""
    __tablename__ = "two_factor_auth"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # 2FA methods
    totp_secret = Column(String(32))  # Base32 encoded secret
    totp_enabled = Column(Boolean, default=False, nullable=False)
    
    # Backup codes
    backup_codes = Column(Text)  # JSON array of hashed backup codes
    
    # SMS 2FA (optional)
    phone_number = Column(String(20))
    sms_enabled = Column(Boolean, default=False, nullable=False)
    phone_verified = Column(Boolean, default=False, nullable=False)
    
    # User relationship (one-to-one)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    user = relationship("User", back_populates="two_factor_auth", uselist=False)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class UserPreferences(Base):
    """User preferences and settings."""
    __tablename__ = "user_preferences"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # UI preferences
    theme = Column(String(20), default="system")  # light, dark, system
    language = Column(String(10), default="en")
    timezone = Column(String(50), default="UTC")
    
    # Keyboard shortcuts (JSON)
    keyboard_shortcuts = Column(Text)
    
    # Display preferences
    font_size = Column(String(10), default="medium")  # small, medium, large
    line_height = Column(String(10), default="normal")  # compact, normal, relaxed
    code_theme = Column(String(50), default="monokai")
    
    # Feature preferences
    enable_animations = Column(Boolean, default=True, nullable=False)
    enable_sounds = Column(Boolean, default=False, nullable=False)
    enable_notifications = Column(Boolean, default=True, nullable=False)
    
    # Privacy
    show_profile_publicly = Column(Boolean, default=True, nullable=False)
    share_statistics = Column(Boolean, default=True, nullable=False)
    
    # User relationship (one-to-one)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    user = relationship("User", back_populates="preferences", uselist=False)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class UserCollection(Base):
    """Custom collections/bookmarks created by users."""
    __tablename__ = "user_collections"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    
    # Visibility
    is_public = Column(Boolean, default=False, nullable=False)
    is_featured = Column(Boolean, default=False, nullable=False)
    
    # Collection items (stored as JSON array of document IDs)
    items = Column(Text, nullable=False, default="[]")
    
    # User relationship
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="collections")
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class LearningProgress(Base):
    """Track user's learning progress and achievements."""
    __tablename__ = "learning_progress"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Progress tracking
    documents_viewed = Column(Integer, default=0, nullable=False)
    commands_learned = Column(Integer, default=0, nullable=False)
    time_spent_minutes = Column(Integer, default=0, nullable=False)
    
    # Streaks
    current_streak = Column(Integer, default=0, nullable=False)
    longest_streak = Column(Integer, default=0, nullable=False)
    last_activity_date = Column(DateTime)
    
    # Achievements (JSON array)
    achievements = Column(Text, default="[]")
    achievement_points = Column(Integer, default=0, nullable=False)
    
    # Learning paths completed (JSON array)
    completed_paths = Column(Text, default="[]")
    
    # User relationship (one-to-one)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    user = relationship("User", back_populates="learning_progress", uselist=False)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CommandSnippet(Base):
    """User's personal command snippets library."""
    __tablename__ = "command_snippets"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    command = Column(Text, nullable=False)
    description = Column(Text)
    
    # Categorization
    category = Column(String(100))
    tags = Column(Text)  # JSON array
    
    # Visibility
    is_public = Column(Boolean, default=False, nullable=False)
    
    # Usage tracking
    usage_count = Column(Integer, default=0, nullable=False)
    last_used = Column(DateTime)
    
    # User relationship
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="snippets")
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)