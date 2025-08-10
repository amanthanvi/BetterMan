"""PostgreSQL-specific models for BetterMan with advanced features."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Index,
    Boolean,
    Float,
    UniqueConstraint,
    CheckConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import (
    JSONB,
    ARRAY,
    TSVECTOR,
    UUID,
    TIMESTAMP,
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.ext.hybrid import hybrid_property
from datetime import datetime
import uuid

Base = declarative_base()


class ManPage(Base):
    """PostgreSQL-optimized man page model with full-text search."""
    
    __tablename__ = "man_pages"
    
    # Primary key with UUID for distributed systems
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Basic fields
    name = Column(String(255), nullable=False, index=True)
    section = Column(String(10), nullable=False, index=True)
    title = Column(Text)
    description = Column(Text)
    synopsis = Column(Text)
    
    # Content stored as JSONB for flexibility
    content = Column(JSONB, nullable=False, default={})
    
    # Full-text search vector
    search_vector = Column(TSVECTOR)
    
    # Category and relations
    category = Column(String(100), index=True)
    related_commands = Column(ARRAY(String), default=[])
    
    # Metadata as JSONB
    metadata = Column(JSONB, default={})
    
    # Performance and caching fields
    is_common = Column(Boolean, default=False, index=True)
    view_count = Column(Integer, default=0)
    last_accessed = Column(TIMESTAMP(timezone=True))
    cache_priority = Column(Integer, default=0)
    
    # Timestamps with timezone
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())
    
    # Relationships
    search_history = relationship(
        "SearchHistory", 
        back_populates="man_page",
        cascade="all, delete-orphan"
    )
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('name', 'section', name='uq_man_page_name_section'),
        CheckConstraint('view_count >= 0', name='check_view_count_positive'),
        Index('idx_man_page_search_vector', 'search_vector', postgresql_using='gin'),
        Index('idx_man_page_category', 'category'),
        Index('idx_man_page_common', 'is_common'),
        Index('idx_man_page_name_section', 'name', 'section'),
        Index('idx_man_page_popularity', 'view_count', 'last_accessed'),
        Index('idx_man_page_created', 'created_at'),
    )
    
    @hybrid_property
    def popularity_score(self):
        """Calculate popularity score for ranking."""
        if self.last_accessed:
            days_since_access = (datetime.utcnow() - self.last_accessed).days
            recency_factor = max(0, 100 - days_since_access)
        else:
            recency_factor = 0
        return self.view_count * 2 + recency_factor


class SearchHistory(Base):
    """Track search queries for analytics and optimization."""
    
    __tablename__ = "search_history"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Search details
    query = Column(String(500), nullable=False, index=True)
    normalized_query = Column(String(500), index=True)
    search_type = Column(String(50))  # 'full_text', 'fuzzy', 'exact'
    
    # Results
    results_count = Column(Integer, default=0)
    clicked_result_id = Column(UUID(as_uuid=True), ForeignKey('man_pages.id'))
    result_position = Column(Integer)  # Position of clicked result
    
    # User tracking (anonymous)
    session_id = Column(String(100), index=True)
    user_agent = Column(String(500))
    ip_hash = Column(String(64))  # Hashed IP for privacy
    
    # Performance metrics
    search_duration_ms = Column(Integer)
    
    # Timestamp
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    
    # Relationships
    man_page = relationship("ManPage", back_populates="search_history")
    
    __table_args__ = (
        Index('idx_search_history_created', 'created_at'),
        Index('idx_search_history_query', 'query'),
        Index('idx_search_history_session', 'session_id'),
    )


class PopularCommand(Base):
    """Cached popular commands for quick access."""
    
    __tablename__ = "popular_commands"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Reference to man page
    man_page_id = Column(UUID(as_uuid=True), ForeignKey('man_pages.id'), nullable=False)
    
    # Popularity metrics
    period = Column(String(20), nullable=False)  # 'daily', 'weekly', 'monthly', 'all_time'
    rank = Column(Integer, nullable=False)
    score = Column(Float, nullable=False)
    view_count = Column(Integer, default=0)
    unique_sessions = Column(Integer, default=0)
    
    # Cache control
    calculated_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    expires_at = Column(TIMESTAMP(timezone=True))
    
    __table_args__ = (
        UniqueConstraint('man_page_id', 'period', name='uq_popular_command_page_period'),
        Index('idx_popular_command_period_rank', 'period', 'rank'),
        Index('idx_popular_command_expires', 'expires_at'),
    )


class Category(Base):
    """Command categories with hierarchical structure."""
    
    __tablename__ = "categories"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    
    # Hierarchical structure
    parent_id = Column(UUID(as_uuid=True), ForeignKey('categories.id'))
    path = Column(String(500))  # Materialized path for efficient queries
    level = Column(Integer, default=0)
    
    # Metadata
    icon = Column(String(50))
    color = Column(String(7))  # Hex color
    order = Column(Integer, default=0)
    
    # Statistics
    command_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())
    
    # Self-referential relationship
    parent = relationship("Category", remote_side=[id], backref="children")
    
    __table_args__ = (
        Index('idx_category_slug', 'slug'),
        Index('idx_category_parent', 'parent_id'),
        Index('idx_category_path', 'path'),
    )


class UserPreference(Base):
    """User preferences for personalization."""
    
    __tablename__ = "user_preferences"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # User identification (can be anonymous session)
    user_id = Column(String(100), unique=True, nullable=False, index=True)
    
    # Preferences as JSONB
    preferences = Column(JSONB, default={})
    
    # Frequently used commands
    frequent_commands = Column(ARRAY(String), default=[])
    
    # Search preferences
    default_sections = Column(ARRAY(String), default=[])
    excluded_categories = Column(ARRAY(String), default=[])
    
    # UI preferences
    theme = Column(String(20), default='light')
    compact_view = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())
    last_active = Column(TIMESTAMP(timezone=True))
    
    __table_args__ = (
        Index('idx_user_preference_user', 'user_id'),
        Index('idx_user_preference_active', 'last_active'),
    )


class CacheMetadata(Base):
    """Track cache status and performance."""
    
    __tablename__ = "cache_metadata"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Cache key and type
    cache_key = Column(String(500), unique=True, nullable=False)
    cache_type = Column(String(50), nullable=False)  # 'page', 'search', 'aggregate'
    
    # Cache data
    data = Column(JSONB)
    compressed_size_bytes = Column(Integer)
    
    # Performance metrics
    hit_count = Column(Integer, default=0)
    miss_count = Column(Integer, default=0)
    avg_response_time_ms = Column(Float)
    
    # TTL and expiration
    ttl_seconds = Column(Integer)
    expires_at = Column(TIMESTAMP(timezone=True))
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    last_accessed = Column(TIMESTAMP(timezone=True))
    
    __table_args__ = (
        Index('idx_cache_metadata_key', 'cache_key'),
        Index('idx_cache_metadata_type', 'cache_type'),
        Index('idx_cache_metadata_expires', 'expires_at'),
    )


# Database functions for full-text search
create_search_trigger = """
CREATE OR REPLACE FUNCTION update_search_vector() RETURNS trigger AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(NEW.synopsis, '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_man_page_search_vector
BEFORE INSERT OR UPDATE OF name, title, description, synopsis
ON man_pages
FOR EACH ROW
EXECUTE FUNCTION update_search_vector();
"""

# Function to search with ranking
search_function = """
CREATE OR REPLACE FUNCTION search_man_pages(
    search_query text,
    limit_results int DEFAULT 20
) RETURNS TABLE(
    id uuid,
    name text,
    section text,
    title text,
    description text,
    rank real
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mp.id,
        mp.name::text,
        mp.section::text,
        mp.title,
        mp.description,
        ts_rank(mp.search_vector, plainto_tsquery('english', search_query)) AS rank
    FROM man_pages mp
    WHERE mp.search_vector @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC, mp.view_count DESC
    LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;
"""

# Function to get popular commands
popular_commands_function = """
CREATE OR REPLACE FUNCTION get_popular_commands(
    time_period text DEFAULT 'weekly',
    limit_results int DEFAULT 10
) RETURNS TABLE(
    id uuid,
    name text,
    section text,
    title text,
    view_count int,
    rank int
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mp.id,
        mp.name::text,
        mp.section::text,
        mp.title,
        mp.view_count,
        ROW_NUMBER() OVER (ORDER BY mp.view_count DESC)::int AS rank
    FROM man_pages mp
    WHERE mp.is_common = true
    ORDER BY mp.view_count DESC
    LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;
"""