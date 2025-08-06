"""Enhanced security configuration and utilities."""

import hashlib
import hmac
import os
import secrets
import string
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set

from cryptography.fernet import Fernet
from fastapi import HTTPException, Request, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, validator

from ..config import get_settings
from ..utils.logger import get_logger

logger = get_logger(__name__)
settings = get_settings()


class SecurityConfig(BaseModel):
    """Security configuration settings."""
    
    # JWT Settings
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    
    # Password Policy
    password_min_length: int = 12
    password_require_uppercase: bool = True
    password_require_lowercase: bool = True
    password_require_numbers: bool = True
    password_require_special: bool = True
    password_history_count: int = 5  # Number of previous passwords to check
    
    # Account Security
    max_login_attempts: int = 5
    lockout_duration_minutes: int = 30
    require_email_verification: bool = True
    session_timeout_minutes: int = 60
    concurrent_sessions_limit: int = 3
    
    # API Security
    rate_limit_per_minute: int = 60
    rate_limit_per_hour: int = 1000
    api_key_length: int = 32
    
    # CORS Settings
    allowed_origins: List[str] = ["http://localhost:5173"]
    allowed_methods: List[str] = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allowed_headers: List[str] = ["*"]
    allow_credentials: bool = True
    
    # Security Headers
    enable_hsts: bool = True
    hsts_max_age: int = 31536000  # 1 year
    enable_csp: bool = True
    csp_policy: str = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
    
    # Input Validation
    max_request_size: int = 10 * 1024 * 1024  # 10MB
    max_query_length: int = 1000
    allowed_file_extensions: Set[str] = {".txt", ".md", ".pdf", ".json"}
    
    @validator("jwt_secret_key")
    def validate_jwt_secret(cls, v):
        if len(v) < 32:
            raise ValueError("JWT secret key must be at least 32 characters long")
        return v


class PasswordValidator:
    """Validate passwords against security policy."""
    
    def __init__(self, config: SecurityConfig):
        self.config = config
        self.pwd_context = CryptContext(
            schemes=["bcrypt"],
            deprecated="auto",
            bcrypt__rounds=12
        )
    
    def validate_password(self, password: str, username: Optional[str] = None) -> List[str]:
        """Validate password and return list of validation errors."""
        errors = []
        
        # Length check
        if len(password) < self.config.password_min_length:
            errors.append(f"Password must be at least {self.config.password_min_length} characters long")
        
        # Uppercase check
        if self.config.password_require_uppercase and not any(c.isupper() for c in password):
            errors.append("Password must contain at least one uppercase letter")
        
        # Lowercase check
        if self.config.password_require_lowercase and not any(c.islower() for c in password):
            errors.append("Password must contain at least one lowercase letter")
        
        # Number check
        if self.config.password_require_numbers and not any(c.isdigit() for c in password):
            errors.append("Password must contain at least one number")
        
        # Special character check
        if self.config.password_require_special:
            special_chars = string.punctuation
            if not any(c in special_chars for c in password):
                errors.append("Password must contain at least one special character")
        
        # Common password check
        common_passwords = {"password", "123456", "admin", "letmein", "qwerty"}
        if password.lower() in common_passwords:
            errors.append("Password is too common")
        
        # Username similarity check
        if username and username.lower() in password.lower():
            errors.append("Password cannot contain username")
        
        return errors
    
    def hash_password(self, password: str) -> str:
        """Hash password using bcrypt."""
        return self.pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash."""
        return self.pwd_context.verify(plain_password, hashed_password)


class TokenManager:
    """Manage JWT tokens and API keys."""
    
    def __init__(self, config: SecurityConfig):
        self.config = config
        self._revoked_tokens: Set[str] = set()
        self._active_sessions: Dict[str, List[Dict[str, Any]]] = {}
    
    def create_access_token(
        self,
        data: Dict[str, Any],
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """Create JWT access token."""
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(
                minutes=self.config.access_token_expire_minutes
            )
        
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "jti": secrets.token_urlsafe(16),  # JWT ID for revocation
            "type": "access"
        })
        
        return jwt.encode(
            to_encode,
            self.config.jwt_secret_key,
            algorithm=self.config.jwt_algorithm
        )
    
    def create_refresh_token(self, user_id: str) -> str:
        """Create JWT refresh token."""
        data = {
            "sub": user_id,
            "type": "refresh",
            "jti": secrets.token_urlsafe(16),
            "exp": datetime.utcnow() + timedelta(
                days=self.config.refresh_token_expire_days
            ),
            "iat": datetime.utcnow()
        }
        
        return jwt.encode(
            data,
            self.config.jwt_secret_key,
            algorithm=self.config.jwt_algorithm
        )
    
    def decode_token(self, token: str) -> Dict[str, Any]:
        """Decode and validate JWT token."""
        try:
            payload = jwt.decode(
                token,
                self.config.jwt_secret_key,
                algorithms=[self.config.jwt_algorithm]
            )
            
            # Check if token is revoked
            jti = payload.get("jti")
            if jti and jti in self._revoked_tokens:
                raise JWTError("Token has been revoked")
            
            return payload
            
        except JWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"}
            )
    
    def revoke_token(self, token: str) -> None:
        """Revoke a token by adding its JTI to revoked set."""
        try:
            payload = jwt.decode(
                token,
                self.config.jwt_secret_key,
                algorithms=[self.config.jwt_algorithm],
                options={"verify_exp": False}  # Check even expired tokens
            )
            jti = payload.get("jti")
            if jti:
                self._revoked_tokens.add(jti)
        except JWTError:
            pass  # Invalid token, ignore
    
    def generate_api_key(self) -> str:
        """Generate a secure API key."""
        return secrets.token_urlsafe(self.config.api_key_length)
    
    def hash_api_key(self, api_key: str) -> str:
        """Hash API key for storage."""
        return hashlib.sha256(api_key.encode()).hexdigest()
    
    def verify_api_key(self, api_key: str, hashed_key: str) -> bool:
        """Verify API key against hash."""
        return hashlib.sha256(api_key.encode()).hexdigest() == hashed_key
    
    def add_session(self, user_id: str, session_data: Dict[str, Any]) -> bool:
        """Add user session and check concurrent session limit."""
        if user_id not in self._active_sessions:
            self._active_sessions[user_id] = []
        
        sessions = self._active_sessions[user_id]
        
        # Remove expired sessions
        now = datetime.utcnow()
        sessions = [
            s for s in sessions
            if s.get("expires_at", now) > now
        ]
        
        # Check concurrent session limit
        if len(sessions) >= self.config.concurrent_sessions_limit:
            # Remove oldest session
            sessions.pop(0)
        
        # Add new session
        session_data["created_at"] = now
        session_data["expires_at"] = now + timedelta(
            minutes=self.config.session_timeout_minutes
        )
        sessions.append(session_data)
        
        self._active_sessions[user_id] = sessions
        return True
    
    def remove_session(self, user_id: str, session_id: str) -> None:
        """Remove a specific user session."""
        if user_id in self._active_sessions:
            self._active_sessions[user_id] = [
                s for s in self._active_sessions[user_id]
                if s.get("session_id") != session_id
            ]


class DataEncryption:
    """Handle sensitive data encryption."""
    
    def __init__(self, key: Optional[bytes] = None):
        if key:
            self.fernet = Fernet(key)
        else:
            # Generate a new key if none provided
            self.fernet = Fernet(Fernet.generate_key())
    
    def encrypt(self, data: Union[str, bytes]) -> str:
        """Encrypt data and return base64 encoded string."""
        if isinstance(data, str):
            data = data.encode()
        
        encrypted = self.fernet.encrypt(data)
        return encrypted.decode()
    
    def decrypt(self, encrypted_data: str) -> str:
        """Decrypt base64 encoded encrypted data."""
        decrypted = self.fernet.decrypt(encrypted_data.encode())
        return decrypted.decode()
    
    @staticmethod
    def generate_key() -> str:
        """Generate a new encryption key."""
        return Fernet.generate_key().decode()


class InputSanitizer:
    """Sanitize and validate user input."""
    
    @staticmethod
    def sanitize_html(text: str) -> str:
        """Remove potentially dangerous HTML tags and attributes."""
        import bleach
        
        allowed_tags = ['p', 'br', 'span', 'em', 'strong', 'code', 'pre']
        allowed_attributes = {}
        
        return bleach.clean(
            text,
            tags=allowed_tags,
            attributes=allowed_attributes,
            strip=True
        )
    
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """Sanitize filename to prevent directory traversal."""
        # Remove any path components
        filename = os.path.basename(filename)
        
        # Remove potentially dangerous characters
        safe_chars = string.ascii_letters + string.digits + '.-_'
        sanitized = ''.join(c for c in filename if c in safe_chars)
        
        # Ensure it has a valid extension
        if '.' not in sanitized:
            sanitized += '.txt'
        
        return sanitized[:255]  # Limit length
    
    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format."""
        import re
        
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))
    
    @staticmethod
    def escape_sql(value: str) -> str:
        """Escape SQL special characters."""
        # Note: This is for display purposes only.
        # Always use parameterized queries for actual SQL!
        return value.replace("'", "''").replace("\\", "\\\\")


class SecurityHeaders:
    """Manage security headers for responses."""
    
    def __init__(self, config: SecurityConfig):
        self.config = config
    
    def get_headers(self) -> Dict[str, str]:
        """Get security headers dictionary."""
        headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
        }
        
        if self.config.enable_hsts:
            headers["Strict-Transport-Security"] = (
                f"max-age={self.config.hsts_max_age}; "
                "includeSubDomains; preload"
            )
        
        if self.config.enable_csp:
            headers["Content-Security-Policy"] = self.config.csp_policy
        
        return headers


class CSRFProtection:
    """CSRF protection using double submit cookies."""
    
    def __init__(self, secret_key: str):
        self.secret_key = secret_key
    
    def generate_token(self) -> str:
        """Generate CSRF token."""
        token = secrets.token_urlsafe(32)
        timestamp = str(int(datetime.utcnow().timestamp()))
        
        # Create signed token
        message = f"{token}:{timestamp}"
        signature = hmac.new(
            self.secret_key.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        return f"{message}:{signature}"
    
    def validate_token(self, token: str, max_age_seconds: int = 3600) -> bool:
        """Validate CSRF token."""
        try:
            parts = token.split(":")
            if len(parts) != 3:
                return False
            
            token_value, timestamp, signature = parts
            
            # Check signature
            message = f"{token_value}:{timestamp}"
            expected_signature = hmac.new(
                self.secret_key.encode(),
                message.encode(),
                hashlib.sha256
            ).hexdigest()
            
            if not hmac.compare_digest(signature, expected_signature):
                return False
            
            # Check age
            token_age = datetime.utcnow().timestamp() - float(timestamp)
            if token_age > max_age_seconds:
                return False
            
            return True
            
        except Exception:
            return False


# Initialize security components
def get_security_config() -> SecurityConfig:
    """Get security configuration."""
    return SecurityConfig(
        jwt_secret_key=settings.JWT_SECRET_KEY,
        allowed_origins=settings.ALLOWED_ORIGINS.split(",") if settings.ALLOWED_ORIGINS else ["*"],
        rate_limit_per_minute=settings.RATE_LIMIT_PER_MINUTE,
        rate_limit_per_hour=settings.RATE_LIMIT_PER_HOUR,
    )


def get_password_validator() -> PasswordValidator:
    """Get password validator instance."""
    return PasswordValidator(get_security_config())


def get_token_manager() -> TokenManager:
    """Get token manager instance."""
    return TokenManager(get_security_config())


def get_data_encryption(key: Optional[str] = None) -> DataEncryption:
    """Get data encryption instance."""
    if key:
        return DataEncryption(key.encode())
    return DataEncryption()


def get_csrf_protection() -> CSRFProtection:
    """Get CSRF protection instance."""
    return CSRFProtection(settings.JWT_SECRET_KEY)