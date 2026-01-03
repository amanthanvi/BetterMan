"""
OAuth2 authentication service for third-party providers.
"""

import os
import json
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from urllib.parse import urlencode, quote_plus
import httpx
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from pydantic import BaseModel

from ..models.user import User
from ..models.oauth import OAuthAccount, OAuthProvider
from ..config import get_settings
from .auth_service import AuthService
import logging

logger = logging.getLogger(__name__)
settings = get_settings()


class OAuthConfig:
    """OAuth provider configurations."""
    
    GITHUB = {
        "client_id": os.getenv("GITHUB_CLIENT_ID", ""),
        "client_secret": os.getenv("GITHUB_CLIENT_SECRET", ""),
        "authorize_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "user_info_url": "https://api.github.com/user",
        "scopes": ["read:user", "user:email"],
    }
    
    GOOGLE = {
        "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "user_info_url": "https://www.googleapis.com/oauth2/v2/userinfo",
        "scopes": ["openid", "email", "profile"],
    }
    
    GITLAB = {
        "client_id": os.getenv("GITLAB_CLIENT_ID", ""),
        "client_secret": os.getenv("GITLAB_CLIENT_SECRET", ""),
        "authorize_url": "https://gitlab.com/oauth/authorize",
        "token_url": "https://gitlab.com/oauth/token",
        "user_info_url": "https://gitlab.com/api/v4/user",
        "scopes": ["read_user"],
    }


class OAuthUserInfo(BaseModel):
    """Standardized OAuth user information."""
    provider_id: str
    email: str
    username: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    provider_data: Dict[str, Any]


class OAuthService:
    """Service for handling OAuth authentication."""
    
    def __init__(self, db, auth_service):
        self.db = db
        self.auth_service = auth_service
        self.redirect_uri = f"{settings.FRONTEND_URL}/auth/callback"
    
    def get_authorization_url(self, provider: OAuthProvider, state: str) -> str:
        """Generate OAuth authorization URL."""
        config = getattr(OAuthConfig, provider.value.upper())
        
        if not config["client_id"]:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"{provider.value} OAuth is not configured"
            )
        
        params = {
            "client_id": config["client_id"],
            "redirect_uri": self.redirect_uri,
            "scope": " ".join(config["scopes"]),
            "state": state,
            "response_type": "code",
        }
        
        # Provider-specific parameters
        if provider == OAuthProvider.GOOGLE:
            params["access_type"] = "offline"
            params["prompt"] = "consent"
        
        return f"{config['authorize_url']}?{urlencode(params)}"
    
    async def exchange_code_for_token(
        self, provider: OAuthProvider, code: str
    ) -> Dict[str, Any]:
        """Exchange authorization code for access token."""
        config = getattr(OAuthConfig, provider.value.upper())
        
        data = {
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "code": code,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                config["token_url"],
                data=data,
                headers={"Accept": "application/json"}
            )
            
            if response.status_code != 200:
                logger.error(f"Token exchange failed: {response.text}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to exchange authorization code"
                )
            
            return response.json()
    
    async def get_user_info(
        self, provider: OAuthProvider, access_token: str
    ) -> OAuthUserInfo:
        """Get user information from OAuth provider."""
        config = getattr(OAuthConfig, provider.value.upper())
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(config["user_info_url"], headers=headers)
            
            if response.status_code != 200:
                logger.error(f"Failed to get user info: {response.text}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to get user information"
                )
            
            data = response.json()
            
            # Parse provider-specific data
            if provider == OAuthProvider.GITHUB:
                # Get primary email if not public
                if not data.get("email"):
                    email_response = await client.get(
                        "https://api.github.com/user/emails",
                        headers=headers
                    )
                    if email_response.status_code == 200:
                        emails = email_response.json()
                        primary = next(
                            (e for e in emails if e["primary"] and e["verified"]),
                            None
                        )
                        if primary:
                            data["email"] = primary["email"]
                
                return OAuthUserInfo(
                    provider_id=str(data["id"]),
                    email=data.get("email", ""),
                    username=data["login"],
                    full_name=data.get("name"),
                    avatar_url=data.get("avatar_url"),
                    provider_data=data
                )
            
            elif provider == OAuthProvider.GOOGLE:
                return OAuthUserInfo(
                    provider_id=data["id"],
                    email=data["email"],
                    username=data["email"].split("@")[0],
                    full_name=data.get("name"),
                    avatar_url=data.get("picture"),
                    provider_data=data
                )
            
            elif provider == OAuthProvider.GITLAB:
                return OAuthUserInfo(
                    provider_id=str(data["id"]),
                    email=data["email"],
                    username=data["username"],
                    full_name=data.get("name"),
                    avatar_url=data.get("avatar_url"),
                    provider_data=data
                )
    
    async def authenticate_oauth_user(
        self, provider: OAuthProvider, code: str
    ) -> Tuple[User, Dict[str, str]]:
        """Authenticate user via OAuth."""
        # Exchange code for token
        token_data = await self.exchange_code_for_token(provider, code)
        access_token = token_data["access_token"]
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in")
        
        # Get user info
        user_info = await self.get_user_info(provider, access_token)
        
        # Check if OAuth account exists
        oauth_account = self.db.query(OAuthAccount).filter(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_account_id == user_info.provider_id
        ).first()
        
        if oauth_account:
            # Update tokens
            oauth_account.access_token = access_token
            if refresh_token:
                oauth_account.refresh_token = refresh_token
            if expires_in:
                oauth_account.expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            oauth_account.last_used = datetime.utcnow()
            oauth_account.provider_data = json.dumps(user_info.provider_data)
            
            user = oauth_account.user
            
            # Update user info if changed
            if user_info.avatar_url and not user.avatar_url:
                user.avatar_url = user_info.avatar_url
            
        else:
            # Check if user with email exists
            user = None
            if user_info.email:
                user = self.db.query(User).filter(
                    User.email == user_info.email
                ).first()
            
            if not user:
                # Create new user
                from .auth_service import UserCreate
                
                # Generate unique username if taken
                username = user_info.username
                counter = 1
                while self.db.query(User).filter(User.username == username).first():
                    username = f"{user_info.username}_{counter}"
                    counter += 1
                
                user_create = UserCreate(
                    username=username,
                    email=user_info.email or f"{username}@{provider.value}.local",
                    password=secrets.token_urlsafe(32),  # Random password
                    full_name=user_info.full_name
                )
                
                user = self.auth_service.create_user(user_create)
                user.avatar_url = user_info.avatar_url
                user.is_verified = True  # OAuth users are pre-verified
            
            # Create OAuth account
            oauth_account = OAuthAccount(
                provider=provider,
                provider_account_id=user_info.provider_id,
                access_token=access_token,
                refresh_token=refresh_token,
                token_type=token_data.get("token_type", "Bearer"),
                expires_at=datetime.utcnow() + timedelta(seconds=expires_in) if expires_in else None,
                provider_data=json.dumps(user_info.provider_data),
                user_id=user.id
            )
            self.db.add(oauth_account)
        
        # Update last login
        user.last_login = datetime.utcnow()
        self.db.commit()
        
        # Generate tokens
        access_token = self.auth_service._create_access_token(user)
        refresh_token = self.auth_service._create_refresh_token(user)
        
        return user, {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": int(self.auth_service.access_token_expire.total_seconds())
        }
    
    def link_oauth_account(
        self, user: User, provider: OAuthProvider, 
        provider_id: str, access_token: str,
        refresh_token: Optional[str] = None,
        expires_in: Optional[int] = None,
        provider_data: Optional[Dict[str, Any]] = None
    ) -> OAuthAccount:
        """Link an OAuth account to existing user."""
        # Check if already linked
        existing = self.db.query(OAuthAccount).filter(
            OAuthAccount.user_id == user.id,
            OAuthAccount.provider == provider
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{provider.value} account already linked"
            )
        
        # Check if provider account is linked to another user
        other_account = self.db.query(OAuthAccount).filter(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_account_id == provider_id
        ).first()
        
        if other_account:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This account is already linked to another user"
            )
        
        # Create link
        oauth_account = OAuthAccount(
            provider=provider,
            provider_account_id=provider_id,
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="Bearer",
            expires_at=datetime.utcnow() + timedelta(seconds=expires_in) if expires_in else None,
            provider_data=json.dumps(provider_data) if provider_data else None,
            user_id=user.id
        )
        
        self.db.add(oauth_account)
        self.db.commit()
        self.db.refresh(oauth_account)
        
        logger.info(f"Linked {provider.value} account to user {user.username}")
        
        return oauth_account
    
    def unlink_oauth_account(self, user: User, provider: OAuthProvider):
        """Unlink an OAuth account from user."""
        oauth_account = self.db.query(OAuthAccount).filter(
            OAuthAccount.user_id == user.id,
            OAuthAccount.provider == provider
        ).first()
        
        if not oauth_account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No {provider.value} account linked"
            )
        
        # Check if user has password or other auth methods
        if not user.hashed_password and len(user.oauth_accounts) == 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot unlink last authentication method. Please set a password first."
            )
        
        self.db.delete(oauth_account)
        self.db.commit()
        
        logger.info(f"Unlinked {provider.value} account from user {user.username}")