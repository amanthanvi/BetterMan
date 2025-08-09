"""
Tests for configuration management.
"""

import os
import pytest
from unittest.mock import patch
from src.config import Settings, get_settings, setup_logging, get_database_config


class TestSettings:
    """Test application settings."""
    
    def test_default_settings(self):
        """Test default settings values."""
        settings = Settings()
        assert settings.APP_NAME == "BetterMan"
        assert settings.APP_VERSION == "1.0.0"
        assert settings.DEBUG is False
        assert settings.ENVIRONMENT == "development"
        assert settings.LOG_LEVEL == "INFO"
    
    def test_environment_variables(self):
        """Test settings from environment variables."""
        with patch.dict(os.environ, {
            "DEBUG": "true",
            "ENVIRONMENT": "production",
            "LOG_LEVEL": "DEBUG",
            "DATABASE_URL": "postgresql://user:pass@localhost/db"
        }):
            settings = Settings()
            assert settings.DEBUG is True
            assert settings.ENVIRONMENT == "production"
            assert settings.LOG_LEVEL == "DEBUG"
            assert settings.DATABASE_URL == "postgresql://user:pass@localhost/db"
    
    def test_log_level_validation(self):
        """Test log level validation."""
        # Valid log levels
        for level in ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
            with patch.dict(os.environ, {"LOG_LEVEL": level}):
                settings = Settings()
                assert settings.LOG_LEVEL == level
        
        # Invalid log level
        with patch.dict(os.environ, {"LOG_LEVEL": "INVALID"}):
            with pytest.raises(ValueError):
                Settings()
    
    def test_cors_origins_parsing(self):
        """Test CORS origins parsing."""
        # Default (allow all)
        settings = Settings()
        assert settings.CORS_ORIGINS == ["*"]
        
        # Multiple origins
        with patch.dict(os.environ, {"CORS_ORIGINS": "http://localhost:3000,https://example.com"}):
            settings = Settings()
            assert settings.CORS_ORIGINS == ["http://localhost:3000", "https://example.com"]
    
    def test_environment_validation(self):
        """Test environment validation."""
        valid_envs = ["development", "staging", "production"]
        for env in valid_envs:
            with patch.dict(os.environ, {"ENVIRONMENT": env}):
                settings = Settings()
                assert settings.ENVIRONMENT == env
        
        # Invalid environment
        with patch.dict(os.environ, {"ENVIRONMENT": "invalid"}):
            with pytest.raises(ValueError):
                Settings()
    
    def test_numeric_constraints(self):
        """Test numeric field constraints."""
        # Valid values
        settings = Settings(
            DATABASE_POOL_SIZE=10,
            SEARCH_MAX_RESULTS=500,
            SEARCH_DEFAULT_LIMIT=50
        )
        assert settings.DATABASE_POOL_SIZE == 10
        assert settings.SEARCH_MAX_RESULTS == 500
        assert settings.SEARCH_DEFAULT_LIMIT == 50
        
        # Invalid values
        with pytest.raises(ValueError):
            Settings(DATABASE_POOL_SIZE=25)  # > 20
        
        with pytest.raises(ValueError):
            Settings(SEARCH_MAX_RESULTS=2000)  # > 1000


class TestGetSettings:
    """Test settings singleton."""
    
    def test_settings_singleton(self):
        """Test that get_settings returns the same instance."""
        settings1 = get_settings()
        settings2 = get_settings()
        assert settings1 is settings2


class TestDatabaseConfig:
    """Test database configuration."""
    
    def test_sqlite_config(self):
        """Test SQLite configuration."""
        settings = Settings(DATABASE_URL="sqlite:///test.db")
        config = get_database_config(settings)
        
        assert "connect_args" in config
        assert config["connect_args"]["check_same_thread"] is False
        assert config["connect_args"]["timeout"] == 30
        assert config["pool_pre_ping"] is True
    
    def test_postgres_config(self):
        """Test PostgreSQL configuration."""
        settings = Settings(
            DATABASE_URL="postgresql://user:pass@localhost/db",
            DATABASE_POOL_SIZE=10,
            DATABASE_POOL_RECYCLE=1800
        )
        config = get_database_config(settings)
        
        assert config["pool_size"] == 10
        assert config["pool_recycle"] == 1800
        assert config["pool_pre_ping"] is True
        assert "connect_args" not in config  # No SQLite-specific args


class TestLogging:
    """Test logging configuration."""
    
    @patch('logging.getLogger')
    def test_setup_logging_json(self, mock_logger):
        """Test JSON logging setup."""
        settings = Settings(LOG_FORMAT="json", LOG_LEVEL="DEBUG")
        setup_logging(settings)
        
        # Verify logger was configured
        mock_logger.assert_called()
    
    @patch('logging.getLogger')
    def test_setup_logging_text(self, mock_logger):
        """Test text logging setup."""
        settings = Settings(LOG_FORMAT="text", LOG_LEVEL="INFO")
        setup_logging(settings)
        
        # Verify logger was configured
        mock_logger.assert_called()
    
    @patch('logging.FileHandler')
    def test_file_logging(self, mock_file_handler):
        """Test file logging configuration."""
        settings = Settings(LOG_FILE="/tmp/test.log")
        setup_logging(settings)
        
        # Verify file handler was created
        mock_file_handler.assert_called_with("/tmp/test.log")