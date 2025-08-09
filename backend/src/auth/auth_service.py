"""
Authentication service with JWT support and security best practices.
"""

import jwt
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from pydantic import BaseModel, EmailStr, validator
import re
from email_validator import validate_email, EmailNotValidError

from ..models.user import User, APIKey
from ..config import get_settings

settings = get_settings()
from ..cache.cache_manager import CacheManager
import logging

logger = logging.getLogger(__name__)


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    
    @validator('username')
    def validate_username(cls, v):
        if not v or len(v) < 3:
            raise ValueError('Username must be at least 3 characters')
        if len(v) > 50:
            raise ValueError('Username must be less than 50 characters')
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError('Username can only contain letters, numbers, underscores and hyphens')
        return v
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class AuthService:
    def __init__(self, db, cache=None):
        self.db = db
        self.cache = cache
        self.secret_key = settings.SECRET_KEY
        self.algorithm = "HS256"
        self.access_token_expire = timedelta(minutes=30)
        self.refresh_token_expire = timedelta(days=7)
    
    def create_user(self, user_data: UserCreate) -> User:
        """Create a new user with validation."""
        # Check if username exists
        if self.db.query(User).filter(User.username == user_data.username).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already registered"
            )
        
        # Check if email exists
        if self.db.query(User).filter(User.email == user_data.email).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Create user
        user = User(
            username=user_data.username,
            email=user_data.email,
            full_name=user_data.full_name
        )
        user.set_password(user_data.password)
        user.generate_email_verification_token()
        
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        
        # TODO: Send verification email
        logger.info(f"Created new user: {user.username}")
        
        return user
    
    def authenticate_user(self, credentials: UserLogin) -> Tuple[User, TokenResponse]:
        """Authenticate user and return tokens."""
        # Find user by username or email
        user = self.db.query(User).filter(
            (User.username == credentials.username) | 
            (User.email == credentials.username)
        ).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        
        # Check if account is locked
        if user.is_locked():
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account temporarily locked due to multiple failed login attempts"
            )
        
        # Verify password
        if not user.verify_password(credentials.password):
            user.increment_failed_login()
            self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        
        # Check if account is active
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive"
            )
        
        # Reset failed login attempts
        user.reset_failed_login()
        user.last_login = datetime.utcnow()
        self.db.commit()
        
        # Generate tokens
        access_token = self._create_access_token(user)
        refresh_token = self._create_refresh_token(user)
        
        # Cache user session
        if self.cache:
            self.cache.set(
                f"user_session:{user.id}",
                {"username": user.username, "email": user.email},
                expire=3600
            )
        
        return user, TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=int(self.access_token_expire.total_seconds())
        )
    
    def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify and decode JWT token."""
        try:
            # Check token blacklist in cache
            if self.cache and self.cache.get(f"blacklist:{token}"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has been revoked"
                )
            
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired"
            )
        except jwt.JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
    
    def get_current_user(self, token: str) -> User:
        """Get current user from token."""
        payload = self.verify_token(token)
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
        
        # Try cache first
        if self.cache:
            cached_user = self.cache.get(f"user:{user_id}")
            if cached_user:
                return User(**cached_user)
        
        # Get from database
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Cache user
        if self.cache:
            self.cache.set(
                f"user:{user_id}",
                {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "is_active": user.is_active,
                    "is_superuser": user.is_superuser
                },
                expire=300
            )
        
        return user
    
    def refresh_access_token(self, refresh_token: str) -> TokenResponse:
        """Refresh access token using refresh token."""
        payload = self.verify_token(refresh_token)
        
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        user_id = payload.get("sub")
        user = self.db.query(User).filter(User.id == user_id).first()
        
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user"
            )
        
        # Generate new access token
        access_token = self._create_access_token(user)
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=int(self.access_token_expire.total_seconds())
        )
    
    def logout(self, token: str, user: User):
        """Logout user and blacklist token."""
        # Add token to blacklist
        if self.cache:
            # Get token expiry
            payload = self.verify_token(token)
            exp = payload.get("exp", 0)
            ttl = exp - int(datetime.utcnow().timestamp())
            
            if ttl > 0:
                self.cache.set(f"blacklist:{token}", True, expire=ttl)
            
            # Clear user session
            self.cache.delete(f"user_session:{user.id}")
            self.cache.delete(f"user:{user.id}")
    
    def create_api_key(self, user: User, name: str, scopes: Optional[list] = None) -> APIKey:
        """Create a new API key for user."""
        api_key = APIKey(
            key=APIKey.generate_key(),
            name=name,
            user_id=user.id,
            scopes=json.dumps(scopes) if scopes else None
        )
        
        self.db.add(api_key)
        self.db.commit()
        self.db.refresh(api_key)
        
        logger.info(f"Created API key '{name}' for user {user.username}")
        
        return api_key
    
    def verify_api_key(self, key: str) -> Tuple[APIKey, User]:
        """Verify API key and return key and user."""
        # Check cache first
        if self.cache:
            cached = self.cache.get(f"api_key:{key}")
            if cached:
                if cached == "invalid":
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid API key"
                    )
                api_key = APIKey(**cached["key"])
                user = User(**cached["user"])
                return api_key, user
        
        # Get from database
        api_key = self.db.query(APIKey).filter(APIKey.key == key).first()
        
        if not api_key or not api_key.is_valid():
            # Cache invalid key
            if self.cache:
                self.cache.set(f"api_key:{key}", "invalid", expire=300)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key"
            )
        
        user = api_key.user
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )
        
        # Update usage
        api_key.last_used = datetime.utcnow()
        api_key.usage_count += 1
        self.db.commit()
        
        # Cache valid key
        if self.cache:
            self.cache.set(
                f"api_key:{key}",
                {
                    "key": {
                        "id": api_key.id,
                        "name": api_key.name,
                        "scopes": api_key.scopes,
                        "rate_limit": api_key.rate_limit
                    },
                    "user": {
                        "id": user.id,
                        "username": user.username,
                        "email": user.email,
                        "is_superuser": user.is_superuser
                    }
                },
                expire=300
            )
        
        return api_key, user
    
    def _create_access_token(self, user: User) -> str:
        """Create JWT access token."""
        payload = {
            "sub": str(user.id),
            "username": user.username,
            "email": user.email,
            "is_superuser": user.is_superuser,
            "type": "access",
            "exp": datetime.utcnow() + self.access_token_expire,
            "iat": datetime.utcnow(),
            "jti": secrets.token_urlsafe(16)  # JWT ID for revocation
        }
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
    
    def _create_refresh_token(self, user: User) -> str:
        """Create JWT refresh token."""
        payload = {
            "sub": str(user.id),
            "type": "refresh",
            "exp": datetime.utcnow() + self.refresh_token_expire,
            "iat": datetime.utcnow(),
            "jti": secrets.token_urlsafe(16)
        }
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)


import json