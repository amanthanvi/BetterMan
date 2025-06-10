"""
Integration tests for API endpoints
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta
import json

from src.main import app
from src.db.session import Base, get_db
from src.models.document import ManPage
from src.models.user import User, UserRole
from src.auth.auth_service import AuthService


# Test database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="module")
def setup_database():
    """Create test database tables"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(setup_database):
    """Create test client"""
    return TestClient(app)


@pytest.fixture
def test_user(client):
    """Create a test user"""
    response = client.post(
        "/api/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123!"
        }
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def auth_headers(client, test_user):
    """Get authentication headers"""
    response = client.post(
        "/api/auth/login",
        json={
            "username": "testuser",
            "password": "TestPass123!"
        }
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_documents():
    """Create test documents in database"""
    db = TestingSessionLocal()
    docs = [
        ManPage(
            command="ls",
            section=1,
            description="list directory contents",
            content="Full ls documentation...",
            html_content="<h1>ls</h1>...",
            tldr="List files and directories"
        ),
        ManPage(
            command="grep",
            section=1,
            description="print lines matching a pattern",
            content="Full grep documentation...",
            html_content="<h1>grep</h1>...",
            tldr="Search text in files"
        ),
        ManPage(
            command="find",
            section=1,
            description="search for files in a directory hierarchy",
            content="Full find documentation...",
            html_content="<h1>find</h1>...",
            tldr="Find files and directories"
        )
    ]
    db.add_all(docs)
    db.commit()
    db.close()
    yield
    # Cleanup
    db = TestingSessionLocal()
    db.query(ManPage).delete()
    db.commit()
    db.close()


class TestAuthEndpoints:
    """Test authentication endpoints"""
    
    def test_register_user(self, client):
        """Test user registration"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "new@example.com",
                "password": "SecurePass123!"
            }
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == "newuser"
        assert data["email"] == "new@example.com"
        assert "password" not in data
    
    def test_register_duplicate_user(self, client, test_user):
        """Test registering duplicate username"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "testuser",
                "email": "another@example.com",
                "password": "Pass123!"
            }
        )
        
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]
    
    def test_login_valid(self, client, test_user):
        """Test login with valid credentials"""
        response = client.post(
            "/api/auth/login",
            json={
                "username": "testuser",
                "password": "TestPass123!"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
    
    def test_login_invalid(self, client):
        """Test login with invalid credentials"""
        response = client.post(
            "/api/auth/login",
            json={
                "username": "nonexistent",
                "password": "wrongpass"
            }
        )
        
        assert response.status_code == 401
    
    def test_refresh_token(self, client, test_user):
        """Test token refresh"""
        # Login first
        login_response = client.post(
            "/api/auth/login",
            json={
                "username": "testuser",
                "password": "TestPass123!"
            }
        )
        refresh_token = login_response.json()["refresh_token"]
        
        # Refresh token
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token}
        )
        
        assert response.status_code == 200
        assert "access_token" in response.json()
    
    def test_protected_endpoint(self, client, auth_headers):
        """Test accessing protected endpoint"""
        response = client.get("/api/user/profile", headers=auth_headers)
        
        assert response.status_code == 200
        assert response.json()["username"] == "testuser"
    
    def test_protected_endpoint_no_auth(self, client):
        """Test accessing protected endpoint without auth"""
        response = client.get("/api/user/profile")
        
        assert response.status_code == 401


class TestDocumentEndpoints:
    """Test document API endpoints"""
    
    def test_get_documents(self, client, test_documents):
        """Test getting list of documents"""
        response = client.get("/api/documents")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 3
        assert data["total"] == 3
    
    def test_get_document_by_command(self, client, test_documents):
        """Test getting document by command"""
        response = client.get("/api/documents/ls")
        
        assert response.status_code == 200
        data = response.json()
        assert data["command"] == "ls"
        assert data["section"] == 1
    
    def test_get_nonexistent_document(self, client):
        """Test getting non-existent document"""
        response = client.get("/api/documents/nonexistent")
        
        assert response.status_code == 404
    
    def test_create_document(self, client, auth_headers):
        """Test creating new document (admin only)"""
        # Would need admin user setup
        pass
    
    def test_update_document(self, client, auth_headers, test_documents):
        """Test updating document (admin only)"""
        # Would need admin user setup
        pass
    
    def test_delete_document(self, client, auth_headers, test_documents):
        """Test deleting document (admin only)"""
        # Would need admin user setup
        pass


class TestSearchEndpoints:
    """Test search functionality"""
    
    def test_basic_search(self, client, test_documents):
        """Test basic search"""
        response = client.get("/api/search?q=list")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) >= 1
        assert data["results"][0]["command"] == "ls"
    
    def test_search_with_filters(self, client, test_documents):
        """Test search with section filter"""
        response = client.get("/api/search?q=grep&section=1")
        
        assert response.status_code == 200
        data = response.json()
        assert all(r["section"] == 1 for r in data["results"])
    
    def test_fuzzy_search(self, client, test_documents):
        """Test fuzzy search"""
        response = client.get("/api/search/fuzzy?q=grp")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) >= 1
        assert any(r["command"] == "grep" for r in data["results"])
    
    def test_instant_search(self, client, test_documents):
        """Test instant search (prefix matching)"""
        response = client.get("/api/search/instant?q=fi")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) >= 1
        assert data["results"][0]["command"] == "find"
    
    def test_advanced_search(self, client, test_documents):
        """Test advanced search with multiple criteria"""
        response = client.post(
            "/api/search/advanced",
            json={
                "query": "search",
                "sections": [1],
                "tags": ["text-processing"],
                "sort_by": "relevance"
            }
        )
        
        assert response.status_code == 200
    
    def test_search_suggestions(self, client, test_documents):
        """Test search suggestions"""
        response = client.get("/api/search/suggestions?q=l")
        
        assert response.status_code == 200
        data = response.json()
        assert "ls" in data["suggestions"]
    
    def test_empty_search(self, client):
        """Test search with empty query"""
        response = client.get("/api/search?q=")
        
        assert response.status_code == 422


class TestTerminalEndpoints:
    """Test terminal sandbox endpoints"""
    
    def test_create_terminal_session(self, client, auth_headers):
        """Test creating terminal session"""
        response = client.post(
            "/api/terminal/session",
            headers=auth_headers,
            json={"command": "ls"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert "websocket_url" in data
    
    def test_terminal_session_unauthorized(self, client):
        """Test terminal session without auth"""
        response = client.post(
            "/api/terminal/session",
            json={"command": "ls"}
        )
        
        assert response.status_code == 401
    
    def test_terminal_session_forbidden_command(self, client, auth_headers):
        """Test terminal with forbidden command"""
        response = client.post(
            "/api/terminal/session",
            headers=auth_headers,
            json={"command": "rm -rf /"}
        )
        
        assert response.status_code == 403
        assert "forbidden" in response.json()["detail"].lower()
    
    def test_list_terminal_sessions(self, client, auth_headers):
        """Test listing user's terminal sessions"""
        response = client.get("/api/terminal/sessions", headers=auth_headers)
        
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_terminate_session(self, client, auth_headers):
        """Test terminating a session"""
        # Create session first
        create_response = client.post(
            "/api/terminal/session",
            headers=auth_headers,
            json={"command": "ls"}
        )
        session_id = create_response.json()["session_id"]
        
        # Terminate it
        response = client.delete(
            f"/api/terminal/session/{session_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200


class TestUserEndpoints:
    """Test user management endpoints"""
    
    def test_get_user_profile(self, client, auth_headers):
        """Test getting user profile"""
        response = client.get("/api/user/profile", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert "password" not in data
    
    def test_update_user_profile(self, client, auth_headers):
        """Test updating user profile"""
        response = client.put(
            "/api/user/profile",
            headers=auth_headers,
            json={"email": "updated@example.com"}
        )
        
        assert response.status_code == 200
        assert response.json()["email"] == "updated@example.com"
    
    def test_change_password(self, client, auth_headers):
        """Test changing password"""
        response = client.post(
            "/api/user/change-password",
            headers=auth_headers,
            json={
                "current_password": "TestPass123!",
                "new_password": "NewPass123!"
            }
        )
        
        assert response.status_code == 200
    
    def test_enable_2fa(self, client, auth_headers):
        """Test enabling 2FA"""
        response = client.post("/api/user/2fa/enable", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "qr_code" in data
        assert "secret" in data
    
    def test_user_favorites(self, client, auth_headers, test_documents):
        """Test user favorites functionality"""
        # Add favorite
        response = client.post(
            "/api/user/favorites",
            headers=auth_headers,
            json={"document_id": 1}
        )
        assert response.status_code == 200
        
        # Get favorites
        response = client.get("/api/user/favorites", headers=auth_headers)
        assert response.status_code == 200
        assert len(response.json()) == 1
        
        # Remove favorite
        response = client.delete(
            "/api/user/favorites/1",
            headers=auth_headers
        )
        assert response.status_code == 200


class TestAnalyticsEndpoints:
    """Test analytics endpoints"""
    
    def test_track_page_view(self, client, auth_headers):
        """Test tracking page view"""
        response = client.post(
            "/api/analytics/pageview",
            headers=auth_headers,
            json={
                "page": "/documents/ls",
                "referrer": "/search"
            }
        )
        
        assert response.status_code == 200
    
    def test_track_search(self, client, auth_headers):
        """Test tracking search query"""
        response = client.post(
            "/api/analytics/search",
            headers=auth_headers,
            json={
                "query": "grep",
                "results_count": 5
            }
        )
        
        assert response.status_code == 200
    
    def test_get_popular_documents(self, client):
        """Test getting popular documents"""
        response = client.get("/api/analytics/popular")
        
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_get_search_trends(self, client):
        """Test getting search trends"""
        response = client.get("/api/analytics/trends")
        
        assert response.status_code == 200
        data = response.json()
        assert "trending_queries" in data
        assert "popular_sections" in data


class TestHealthEndpoints:
    """Test health check endpoints"""
    
    def test_health_check(self, client):
        """Test basic health check"""
        response = client.get("/api/health")
        
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
    
    def test_detailed_health_check(self, client):
        """Test detailed health check"""
        response = client.get("/api/health/detailed")
        
        assert response.status_code == 200
        data = response.json()
        assert "database" in data
        assert "redis" in data
        assert "disk_space" in data
        assert "memory" in data


class TestRateLimiting:
    """Test rate limiting functionality"""
    
    def test_rate_limit_enforcement(self, client):
        """Test that rate limits are enforced"""
        # Make many requests quickly
        responses = []
        for _ in range(15):
            responses.append(client.get("/api/search?q=test"))
        
        # Some should be rate limited
        assert any(r.status_code == 429 for r in responses)
    
    def test_rate_limit_headers(self, client):
        """Test rate limit headers"""
        response = client.get("/api/search?q=test")
        
        assert "X-RateLimit-Limit" in response.headers
        assert "X-RateLimit-Remaining" in response.headers
        assert "X-RateLimit-Reset" in response.headers


class TestErrorHandling:
    """Test error handling"""
    
    def test_validation_error(self, client):
        """Test validation error response"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "a",  # Too short
                "email": "invalid-email",
                "password": "weak"
            }
        )
        
        assert response.status_code == 422
        errors = response.json()["detail"]
        assert any("username" in str(e) for e in errors)
        assert any("email" in str(e) for e in errors)
        assert any("password" in str(e) for e in errors)
    
    def test_404_error(self, client):
        """Test 404 error response"""
        response = client.get("/api/nonexistent")
        
        assert response.status_code == 404
    
    def test_500_error_handling(self, client, monkeypatch):
        """Test 500 error handling"""
        def mock_error(*args, **kwargs):
            raise Exception("Simulated server error")
        
        monkeypatch.setattr("src.api.routes.get_documents", mock_error)
        
        response = client.get("/api/documents")
        
        assert response.status_code == 500
        assert "error" in response.json()