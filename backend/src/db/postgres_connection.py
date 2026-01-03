"""PostgreSQL connection management for Railway deployment."""

import os
import logging
from typing import Optional, AsyncGenerator
from contextlib import asynccontextmanager
from sqlalchemy import create_engine, MetaData, event
from sqlalchemy.ext.asyncio import (
    create_async_engine, 
    AsyncSession, 
    async_sessionmaker,
    AsyncEngine
)
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool
from urllib.parse import urlparse, urlunparse

from ..config import get_settings
# Import Base from postgres_models when needed to avoid circular imports

logger = logging.getLogger(__name__)
settings = get_settings()


def get_database_url(async_mode: bool = False) -> str:
    """
    Get properly formatted database URL for Railway PostgreSQL.
    
    Args:
        async_mode: If True, return asyncpg URL format
    
    Returns:
        Formatted database URL
    """
    database_url = os.environ.get('DATABASE_URL', settings.DATABASE_URL)
    
    # Handle Railway internal domain
    if '.railway.internal' in database_url:
        # Check if we're running inside Railway (internal domains work there)
        if os.environ.get('RAILWAY_ENVIRONMENT'):
            logger.info("Using Railway internal domain for database connection")
        else:
            # We're running locally, need public URL
            public_url = os.environ.get('DATABASE_PUBLIC_URL')
            if public_url:
                database_url = public_url
                logger.info("Using DATABASE_PUBLIC_URL for external connection")
            else:
                logger.warning("DATABASE_URL contains .railway.internal which is not accessible externally")
    
    # Handle Railway PostgreSQL URL format
    if database_url.startswith('postgresql://'):
        if async_mode:
            # Convert to asyncpg format
            database_url = database_url.replace('postgresql://', 'postgresql+asyncpg://')
        else:
            # Use psycopg3 format (just postgresql:// works with psycopg3)
            # psycopg3 accepts postgresql:// directly
            pass
    
    # Parse and validate URL
    parsed = urlparse(database_url)
    
    # Add SSL mode for production
    if settings.ENVIRONMENT == 'production' and 'sslmode' not in parsed.query:
        if parsed.query:
            query = f"{parsed.query}&sslmode=require"
        else:
            query = "sslmode=require"
        
        database_url = urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            query,
            parsed.fragment
        ))
    
    return database_url


# Synchronous setup (for migrations and admin tasks)
def get_sync_engine():
    """Create synchronous SQLAlchemy engine with psycopg3."""
    database_url = get_database_url(async_mode=False)
    
    # For psycopg3, we can use postgresql:// directly or postgresql+psycopg://
    if database_url.startswith('postgresql://') and '+' not in database_url:
        # SQLAlchemy 2.0+ with psycopg3 uses this format
        database_url = database_url.replace('postgresql://', 'postgresql+psycopg://')
    
    engine = create_engine(
        database_url,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=10,
        pool_recycle=settings.DATABASE_POOL_RECYCLE,
        pool_pre_ping=True,
        echo=settings.DEBUG,
        connect_args={
            "options": f"-c application_name=betterman_{settings.ENVIRONMENT} -c default_text_search_config=english",
            "connect_timeout": 10,
        } if not database_url.startswith('sqlite') else {}
    )
    
    # Add connection event listeners
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        if database_url.startswith('sqlite'):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    
    return engine


# Create sync session factory
engine = get_sync_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """Get database session for dependency injection with proper transaction handling."""
    db = SessionLocal()
    try:
        yield db
        # Commit if no errors occurred
        if db.is_active:
            try:
                db.commit()
            except Exception as e:
                logger.error(f"Error committing transaction: {e}")
                db.rollback()
                raise
    except Exception as e:
        # Rollback on any error
        if db.is_active:
            db.rollback()
        raise
    finally:
        db.close()


# Asynchronous setup (for high-performance API endpoints)
async_engine: Optional[AsyncEngine] = None
AsyncSessionLocal: Optional[async_sessionmaker] = None


async def init_async_db():
    """Initialize async database connection."""
    global async_engine, AsyncSessionLocal
    
    database_url = get_database_url(async_mode=True)
    
    # Create async engine with proper configuration
    async_engine = create_async_engine(
        database_url,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=10,
        pool_recycle=settings.DATABASE_POOL_RECYCLE,
        pool_pre_ping=True,
        echo=settings.DEBUG,
        # Use NullPool for serverless/Railway deployments
        poolclass=NullPool if settings.ENVIRONMENT == 'production' else None
    )
    
    # Create async session factory
    AsyncSessionLocal = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    
    # Test connection
    try:
        from ..models.postgres_models import Base
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            logger.info("Async database connection established successfully")
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session for dependency injection."""
    if AsyncSessionLocal is None:
        await init_async_db()
    
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@asynccontextmanager
async def get_asyncpg_pool():
    """
    DEPRECATED: Direct asyncpg pool disabled to prevent connection issues.
    Use get_async_db() for async database operations instead.
    """
    # Return None to prevent asyncpg usage
    yield None


def init_db():
    """Initialize database with all tables and functions."""
    try:
        # Import here to avoid circular imports
        from ..models.postgres_models import Base
        # Create all tables
        Base.metadata.create_all(bind=engine)
        
        # Execute PostgreSQL-specific functions if using PostgreSQL
        database_url = get_database_url()
        if 'postgresql' in database_url:
            try:
                from ..models.postgres_models import (
                    create_search_trigger,
                    search_function,
                    popular_commands_function
                )
                
                from sqlalchemy import text
                
                with engine.begin() as conn:
                    # Create search trigger
                    conn.execute(text(create_search_trigger))
                    
                    # Create search function
                    conn.execute(text(search_function))
                    
                    # Create popular commands function
                    conn.execute(text(popular_commands_function))
                    
                    logger.info("PostgreSQL functions and triggers created successfully")
            except Exception as e:
                logger.warning(f"Could not create PostgreSQL functions (may already exist): {e}")
        
        logger.info("Database initialized successfully")
        
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise


def drop_all_tables():
    """Drop all tables (use with caution!)."""
    from ..models.postgres_models import Base
    Base.metadata.drop_all(bind=engine)
    logger.warning("All database tables dropped")


# Health check function
async def check_database_health() -> dict:
    """Check database health and return status."""
    try:
        # Try async connection
        if async_engine:
            async with async_engine.connect() as conn:
                result = await conn.execute("SELECT 1")
                await conn.commit()
        
        # Try sync connection as fallback
        with engine.connect() as conn:
            result = conn.execute("SELECT 1")
            conn.commit()
        
        return {
            "status": "healthy",
            "database": "connected",
            "pool_size": settings.DATABASE_POOL_SIZE,
            "environment": settings.ENVIRONMENT
        }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }