"""
Configuration management for BetterMan backend.
"""

import os
import logging
from typing import Optional, Dict, Any
from pydantic_settings import BaseSettings
from pydantic import validator, Field
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings with validation."""

    # Application
    APP_NAME: str = "BetterMan"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = Field(default=False, env="DEBUG")
    ENVIRONMENT: str = Field(default="development", env="ENVIRONMENT")

    # API
    API_PREFIX: str = "/api"
    API_VERSION: str = "v1"

    # Database
    DATABASE_URL: str = Field(
        default="sqlite:///./data/betterman.db", env="DATABASE_URL"
    )
    DATABASE_POOL_SIZE: int = Field(default=5, ge=1, le=20)
    DATABASE_POOL_RECYCLE: int = Field(default=3600)  # 1 hour
    DATABASE_POOL_TIMEOUT: int = Field(default=30)

    # Logging
    LOG_LEVEL: str = Field(default="INFO", env="LOG_LEVEL")
    LOG_FORMAT: str = "json"  # "json" or "text"
    LOG_FILE: Optional[str] = Field(default=None, env="LOG_FILE")

    # Security
    SECRET_KEY: str = Field(
        default="development-secret-key-change-in-production",
        env="SECRET_KEY"
    )
    JWT_ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)
    
    # CORS
    CORS_ORIGINS: str = Field(
        default="http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000",
        env="CORS_ORIGINS",
    )
    CORS_CREDENTIALS: bool = Field(default=True)
    CORS_METHODS: str = Field(default="GET,POST,PUT,DELETE,OPTIONS")
    CORS_HEADERS: str = Field(default="*")
    
    # Additional Security
    ALLOWED_HOSTS: str = Field(default="*", env="ALLOWED_HOSTS")
    BCRYPT_ROUNDS: int = Field(default=12, ge=10, le=16)
    PASSWORD_MIN_LENGTH: int = Field(default=8)
    SESSION_COOKIE_SECURE: bool = Field(default=True)
    SESSION_COOKIE_HTTPONLY: bool = Field(default=True)
    SESSION_COOKIE_SAMESITE: str = Field(default="lax")

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = Field(default=True)
    RATE_LIMIT_DEFAULT: str = Field(default="100/minute")
    RATE_LIMIT_SEARCH: str = Field(default="30/minute")
    RATE_LIMIT_IMPORT: str = Field(default="10/minute")

    # Caching
    CACHE_DIR: str = Field(default=".cache", env="CACHE_DIR")
    CACHE_TTL: int = Field(default=3600)  # 1 hour
    CACHE_MAX_SIZE: int = Field(default=1000)
    
    # Redis (optional)
    REDIS_HOST: str = Field(default="redis", env="REDIS_HOST")
    REDIS_PORT: int = Field(default=6379, env="REDIS_PORT")
    REDIS_DB: int = Field(default=0, env="REDIS_DB")
    REDIS_PASSWORD: Optional[str] = Field(default=None, env="REDIS_PASSWORD")
    REDIS_URL: Optional[str] = Field(default=None, env="REDIS_URL")

    # Search
    SEARCH_MIN_LENGTH: int = Field(default=2, ge=1)
    SEARCH_MAX_RESULTS: int = Field(default=100, ge=10, le=1000)
    SEARCH_DEFAULT_LIMIT: int = Field(default=20, ge=5, le=100)

    # Performance
    REQUEST_TIMEOUT: int = Field(default=30)
    MAX_REQUEST_SIZE: int = Field(default=10 * 1024 * 1024)  # 10MB

    # Monitoring
    METRICS_ENABLED: bool = Field(default=True)
    METRICS_PREFIX: str = Field(default="betterman")
    HEALTH_CHECK_INTERVAL: int = Field(default=60)  # seconds
    SENTRY_DSN: Optional[str] = Field(default=None, env="SENTRY_DSN")

    @validator("LOG_LEVEL")
    def validate_log_level(cls, v):
        """Validate log level."""
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if v.upper() not in valid_levels:
            raise ValueError(f"Invalid log level: {v}")
        return v.upper()

    @validator("CORS_ORIGINS")
    def parse_cors_origins(cls, v):
        """Parse CORS origins from comma-separated string."""
        if v == "*":
            return ["*"]
        return [origin.strip() for origin in v.split(",") if origin.strip()]

    @validator("ENVIRONMENT")
    def validate_environment(cls, v):
        """Validate environment."""
        valid_envs = ["development", "staging", "production"]
        if v not in valid_envs:
            raise ValueError(f"Invalid environment: {v}")
        return v
    
    @validator("SECRET_KEY")
    def validate_secret_key(cls, v, values):
        """Validate secret key."""
        env = values.get("ENVIRONMENT", "development")
        if env == "production" and v == "development-secret-key-change-in-production":
            raise ValueError("Must set SECRET_KEY in production")
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return v

    class Config:
        """Pydantic config."""

        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


def setup_logging(settings: Settings) -> None:
    """
    Configure logging based on settings.

    Args:
        settings: Application settings
    """
    # Create formatter based on format setting
    if settings.LOG_FORMAT == "json":
        from pythonjsonlogger import jsonlogger

        formatter = jsonlogger.JsonFormatter(
            fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    else:
        formatter = logging.Formatter(
            fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.LOG_LEVEL))

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # File handler if specified
    if settings.LOG_FILE:
        file_handler = logging.FileHandler(settings.LOG_FILE)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    # Set specific logger levels
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    # Log startup info
    logger = logging.getLogger(__name__)
    logger.info(
        f"Logging configured",
        extra={
            "log_level": settings.LOG_LEVEL,
            "log_format": settings.LOG_FORMAT,
            "environment": settings.ENVIRONMENT,
        },
    )


def get_database_config(settings: Settings) -> Dict[str, Any]:
    """
    Get database configuration with connection pooling.

    Args:
        settings: Application settings

    Returns:
        Database configuration dict
    """
    config = {
        "pool_size": settings.DATABASE_POOL_SIZE,
        "pool_recycle": settings.DATABASE_POOL_RECYCLE,
        "pool_timeout": settings.DATABASE_POOL_TIMEOUT,
        "pool_pre_ping": True,
    }

    # SQLite-specific settings
    if settings.DATABASE_URL.startswith("sqlite"):
        config.update(
            {
                "connect_args": {
                    "check_same_thread": False,
                    "timeout": 30,
                }
            }
        )

    return config
