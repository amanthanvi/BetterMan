"""
Integration tests for authentication and authorization.
"""

import pytest
import jwt
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from src.auth.models import User, UserSession
from src.auth.auth_service import AuthService
from src.auth.dependencies import get_current_user, SuperUser
from src.config import get_settings


@pytest.mark.integration
class TestAuthService:
    """Integration tests for authentication service."""
    
    @pytest.fixture
    def auth_service(self, test_db):
        """Create auth service instance."""
        settings = get_settings()
        return AuthService(test_db, settings)
    
    @pytest.fixture
    def test_user_data(self):
        """Test user data."""
        return {
            "username": "testuser",
            "email": "test@example.com",
            "password": "SecurePassword123!",
            "full_name": "Test User"
        }
    
    def test_register_user(self, auth_service, test_user_data):
        """Test user registration."""
        # Register new user
        user = auth_service.register_user(
            username=test_user_data["username"],
            email=test_user_data["email"],
            password=test_user_data["password"],
            full_name=test_user_data["full_name"]
        )
        
        assert user is not None
        assert user.username == test_user_data["username"]
        assert user.email == test_user_data["email"]
        assert user.is_active is True
        assert user.is_superuser is False
        
        # Password should be hashed
        assert user.hashed_password != test_user_data["password"]
        assert auth_service.verify_password(test_user_data["password"], user.hashed_password)
    
    def test_register_duplicate_user(self, auth_service, test_user_data):
        """Test registering duplicate user."""
        # Register first user
        auth_service.register_user(**test_user_data)
        
        # Try to register with same username
        with pytest.raises(ValueError, match="Username already exists"):
            auth_service.register_user(**test_user_data)
        
        # Try to register with same email
        with pytest.raises(ValueError, match="Email already exists"):
            auth_service.register_user(
                username="different",
                email=test_user_data["email"],
                password="password",
                full_name="Different User"
            )
    
    def test_authenticate_user(self, auth_service, test_user_data):
        """Test user authentication."""
        # Register user
        auth_service.register_user(**test_user_data)
        
        # Authenticate with correct credentials
        user = auth_service.authenticate_user(
            test_user_data["username"],
            test_user_data["password"]
        )
        assert user is not None
        assert user.username == test_user_data["username"]
        
        # Authenticate with email
        user = auth_service.authenticate_user(
            test_user_data["email"],
            test_user_data["password"]
        )
        assert user is not None
        
        # Wrong password
        user = auth_service.authenticate_user(
            test_user_data["username"],
            "WrongPassword"
        )
        assert user is None
        
        # Non-existent user
        user = auth_service.authenticate_user("nonexistent", "password")
        assert user is None
    
    def test_create_access_token(self, auth_service, test_user_data):
        """Test JWT token creation."""
        # Register and get user
        user = auth_service.register_user(**test_user_data)
        
        # Create token
        token = auth_service.create_access_token(user)
        assert token is not None
        
        # Decode and verify token
        settings = get_settings()
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        
        assert payload["sub"] == str(user.id)
        assert "exp" in payload
        assert "iat" in payload
    
    def test_create_refresh_token(self, auth_service, test_user_data):
        """Test refresh token creation."""
        # Register user
        user = auth_service.register_user(**test_user_data)
        
        # Create refresh token
        refresh_token = auth_service.create_refresh_token(user)
        assert refresh_token is not None
        
        # Verify token is stored in database
        session = auth_service.db.query(UserSession).filter_by(
            user_id=user.id,
            session_token=refresh_token
        ).first()
        assert session is not None
        assert session.is_active is True
    
    def test_refresh_access_token(self, auth_service, test_user_data):
        """Test refreshing access token."""
        # Register user
        user = auth_service.register_user(**test_user_data)
        
        # Create refresh token
        refresh_token = auth_service.create_refresh_token(user)
        
        # Refresh access token
        new_access_token = auth_service.refresh_access_token(refresh_token)
        assert new_access_token is not None
        
        # Verify new token
        settings = get_settings()
        payload = jwt.decode(
            new_access_token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        assert payload["sub"] == str(user.id)
    
    def test_revoke_token(self, auth_service, test_user_data):
        """Test token revocation."""
        # Register user
        user = auth_service.register_user(**test_user_data)
        
        # Create tokens
        access_token = auth_service.create_access_token(user)
        refresh_token = auth_service.create_refresh_token(user)
        
        # Revoke refresh token
        success = auth_service.revoke_token(refresh_token)
        assert success is True
        
        # Try to use revoked token
        new_token = auth_service.refresh_access_token(refresh_token)
        assert new_token is None
    
    def test_oauth_login(self, auth_service):
        """Test OAuth login flow."""
        oauth_data = {
            "provider": "github",
            "provider_user_id": "12345",
            "email": "oauth@example.com",
            "name": "OAuth User"
        }
        
        # First OAuth login - creates user
        user = auth_service.oauth_login(
            provider=oauth_data["provider"],
            provider_user_id=oauth_data["provider_user_id"],
            email=oauth_data["email"],
            name=oauth_data["name"]
        )
        
        assert user is not None
        assert user.email == oauth_data["email"]
        assert user.oauth_provider == oauth_data["provider"]
        assert user.oauth_provider_id == oauth_data["provider_user_id"]
        
        # Second OAuth login - returns existing user
        user2 = auth_service.oauth_login(**oauth_data)
        assert user2.id == user.id
    
    def test_update_user_profile(self, auth_service, test_user_data):
        """Test updating user profile."""
        # Register user
        user = auth_service.register_user(**test_user_data)
        
        # Update profile
        updated = auth_service.update_user(
            user.id,
            full_name="Updated Name",
            bio="Test bio"
        )
        
        assert updated.full_name == "Updated Name"
        assert updated.bio == "Test bio"
        assert updated.username == test_user_data["username"]  # Unchanged
    
    def test_change_password(self, auth_service, test_user_data):
        """Test password change."""
        # Register user
        user = auth_service.register_user(**test_user_data)
        
        # Change password
        new_password = "NewSecurePassword123!"
        success = auth_service.change_password(
            user.id,
            test_user_data["password"],
            new_password
        )
        assert success is True
        
        # Verify old password no longer works
        auth_user = auth_service.authenticate_user(
            test_user_data["username"],
            test_user_data["password"]
        )
        assert auth_user is None
        
        # Verify new password works
        auth_user = auth_service.authenticate_user(
            test_user_data["username"],
            new_password
        )
        assert auth_user is not None
    
    def test_deactivate_user(self, auth_service, test_user_data):
        """Test user deactivation."""
        # Register user
        user = auth_service.register_user(**test_user_data)
        
        # Deactivate user
        auth_service.deactivate_user(user.id)
        
        # User should not be able to authenticate
        auth_user = auth_service.authenticate_user(
            test_user_data["username"],
            test_user_data["password"]
        )
        assert auth_user is None
        
        # Verify user is deactivated in database
        db_user = auth_service.get_user_by_id(user.id)
        assert db_user.is_active is False


@pytest.mark.integration
class TestAuthAPI:
    """Integration tests for authentication API endpoints."""
    
    @pytest.fixture
    def registered_user(self, client):
        """Register a test user."""
        user_data = {
            "username": "apitest",
            "email": "apitest@example.com",
            "password": "TestPassword123!",
            "full_name": "API Test User"
        }
        
        response = client.post("/api/auth/register", json=user_data)
        assert response.status_code == 201
        
        return user_data
    
    def test_register_endpoint(self, client):
        """Test user registration endpoint."""
        user_data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePass123!",
            "full_name": "New User"
        }
        
        response = client.post("/api/auth/register", json=user_data)
        assert response.status_code == 201
        
        data = response.json()
        assert data["username"] == user_data["username"]
        assert data["email"] == user_data["email"]
        assert "id" in data
        assert "access_token" in data
        assert "refresh_token" in data
    
    def test_login_endpoint(self, client, registered_user):
        """Test login endpoint."""
        login_data = {
            "username": registered_user["username"],
            "password": registered_user["password"]
        }
        
        response = client.post("/api/auth/login", data=login_data)
        assert response.status_code == 200
        
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert "token_type" in data
        assert data["token_type"] == "bearer"
    
    def test_refresh_token_endpoint(self, client, registered_user):
        """Test token refresh endpoint."""
        # Login to get tokens
        login_response = client.post("/api/auth/login", data={
            "username": registered_user["username"],
            "password": registered_user["password"]
        })
        tokens = login_response.json()
        
        # Refresh token
        refresh_data = {"refresh_token": tokens["refresh_token"]}
        response = client.post("/api/auth/refresh", json=refresh_data)
        assert response.status_code == 200
        
        data = response.json()
        assert "access_token" in data
        assert data["access_token"] != tokens["access_token"]  # New token
    
    def test_protected_endpoint(self, client, registered_user):
        """Test accessing protected endpoint."""
        # Login to get token
        login_response = client.post("/api/auth/login", data={
            "username": registered_user["username"],
            "password": registered_user["password"]
        })
        token = login_response.json()["access_token"]
        
        # Access protected endpoint with token
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["username"] == registered_user["username"]
        assert data["email"] == registered_user["email"]
        
        # Access without token
        response = client.get("/api/auth/me")
        assert response.status_code == 401
    
    def test_logout_endpoint(self, client, registered_user):
        """Test logout endpoint."""
        # Login
        login_response = client.post("/api/auth/login", data={
            "username": registered_user["username"],
            "password": registered_user["password"]
        })
        tokens = login_response.json()
        
        # Logout
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        response = client.post("/api/auth/logout", headers=headers, json={
            "refresh_token": tokens["refresh_token"]
        })
        assert response.status_code == 200
        
        # Try to use refresh token after logout
        refresh_response = client.post("/api/auth/refresh", json={
            "refresh_token": tokens["refresh_token"]
        })
        assert refresh_response.status_code == 401
    
    def test_update_profile_endpoint(self, client, registered_user):
        """Test profile update endpoint."""
        # Login
        login_response = client.post("/api/auth/login", data={
            "username": registered_user["username"],
            "password": registered_user["password"]
        })
        token = login_response.json()["access_token"]
        
        # Update profile
        headers = {"Authorization": f"Bearer {token}"}
        update_data = {
            "full_name": "Updated Name",
            "bio": "Updated bio"
        }
        
        response = client.put("/api/auth/profile", headers=headers, json=update_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["full_name"] == update_data["full_name"]
        assert data["bio"] == update_data["bio"]
    
    def test_change_password_endpoint(self, client, registered_user):
        """Test password change endpoint."""
        # Login
        login_response = client.post("/api/auth/login", data={
            "username": registered_user["username"],
            "password": registered_user["password"]
        })
        token = login_response.json()["access_token"]
        
        # Change password
        headers = {"Authorization": f"Bearer {token}"}
        password_data = {
            "current_password": registered_user["password"],
            "new_password": "NewSecurePass123!"
        }
        
        response = client.post("/api/auth/change-password", headers=headers, json=password_data)
        assert response.status_code == 200
        
        # Verify old password doesn't work
        login_response = client.post("/api/auth/login", data={
            "username": registered_user["username"],
            "password": registered_user["password"]
        })
        assert login_response.status_code == 401
        
        # Verify new password works
        login_response = client.post("/api/auth/login", data={
            "username": registered_user["username"],
            "password": password_data["new_password"]
        })
        assert login_response.status_code == 200
    
    def test_oauth_callback(self, client):
        """Test OAuth callback endpoint."""
        with patch('src.auth.oauth_providers.github_oauth.get_user_info') as mock_github:
            mock_github.return_value = {
                "id": "12345",
                "email": "github@example.com",
                "name": "GitHub User"
            }
            
            # Simulate OAuth callback
            response = client.get("/api/auth/oauth/github/callback?code=test_code&state=test_state")
            assert response.status_code in [200, 302]  # Might redirect
            
            if response.status_code == 200:
                data = response.json()
                assert "access_token" in data
                assert "refresh_token" in data