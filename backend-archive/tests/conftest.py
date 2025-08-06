"""
Pytest configuration and fixtures for BetterMan tests.
"""

import pytest
import os
import sys
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Add the src directory to the Python path
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

# Import after path setup
from src.main import app
from src.db.session import Base, get_db
from src.config import Settings, get_settings


# Test database URL
TEST_DATABASE_URL = "sqlite:///./test.db"


@pytest.fixture(scope="session")
def test_settings():
    """Override settings for testing."""
    return Settings(
        DATABASE_URL=TEST_DATABASE_URL,
        ENVIRONMENT="development",
        DEBUG=True,
        LOG_LEVEL="DEBUG",
        CORS_ORIGINS="http://localhost:3000,http://testserver"
    )


@pytest.fixture(scope="session")
def test_engine():
    """Create test database engine."""
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    return engine


@pytest.fixture(scope="session")
def test_db_setup(test_engine):
    """Create test database tables."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    # Clean up test database file
    if os.path.exists("test.db"):
        os.remove("test.db")


@pytest.fixture
def test_db(test_engine, test_db_setup):
    """Create test database session."""
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client(test_db, test_settings, monkeypatch):
    """Create test client with test database."""
    # Override settings
    monkeypatch.setattr("src.config.get_settings", lambda: test_settings)
    
    # Override database dependency
    def override_get_db():
        try:
            yield test_db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
    
    # Clean up overrides
    app.dependency_overrides.clear()


@pytest.fixture
def sample_document_data():
    """Sample document data for testing."""
    return {
        "name": "test",
        "title": "test - a test command",
        "section": "1",
        "summary": "A test command for testing",
        "raw_content": ".TH TEST 1\n.SH NAME\ntest - a test command",
        "is_common": True,
        "access_count": 0,
        "cache_status": "permanent",
        "cache_priority": 100
    }


@pytest.fixture
def sample_parsed_data():
    """Sample parsed man page data."""
    return {
        "title": "test",
        "section": "1",
        "date": "2024-01-01",
        "source": "Test 1.0",
        "manual": "Test Manual",
        "sections": [
            {
                "name": "NAME",
                "content": "test - a test command"
            },
            {
                "name": "SYNOPSIS",
                "content": "**test** [*OPTIONS*]"
            },
            {
                "name": "DESCRIPTION",
                "content": "This is a test command.",
                "subsections": [
                    {
                        "name": "Options",
                        "content": "**-h**: Show help"
                    }
                ]
            }
        ],
        "related": ["ls", "cat"],
        "parsed_at": "2024-01-01T00:00:00"
    }


@pytest.fixture
def auth_headers():
    """Authentication headers for testing (when auth is implemented)."""
    return {
        "Authorization": "Bearer test-token",
        "X-API-Key": "test-api-key"
    }


@pytest.fixture(autouse=True)
def reset_singletons():
    """Reset singleton instances between tests."""
    # Clear the lru_cache for get_settings
    from src.config import get_settings
    get_settings.cache_clear()
    
    yield


@pytest.fixture
def mock_man_page_content():
    """Mock man page content for testing."""
    return """.TH LS 1 "November 2023" "GNU coreutils 9.1" "User Commands"
.SH NAME
ls \\- list directory contents
.SH SYNOPSIS
.B ls
[\\fIOPTION\\fR]... [\\fIFILE\\fR]...
.SH DESCRIPTION
List information about the FILEs (the current directory by default).
Sort entries alphabetically if none of
.BR \\-cftuvSUX
nor
.B \\-\\-sort
is specified.
.PP
Mandatory arguments to long options are mandatory for short options too.
.SH OPTIONS
.TP
.BR \\-a ", " \\-\\-all
do not ignore entries starting with .
.TP
.BR \\-A ", " \\-\\-almost\\-all
do not list implied . and ..
.SH EXAMPLES
.TP
.B ls
List files in the current directory
.TP
.B ls -la /home
List all files in /home with details
.SH "SEE ALSO"
.BR dir (1),
.BR vdir (1),
.BR dircolors (1),
.BR cp (1),
.BR mv (1),
.BR rm (1)
"""


# Pytest configuration
def pytest_configure(config):
    """Configure pytest."""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )
    config.addinivalue_line(
        "markers", "unit: marks tests as unit tests"
    )