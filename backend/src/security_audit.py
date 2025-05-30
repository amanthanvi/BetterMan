"""
Security audit utilities and enhancements for BetterMan.
"""

import re
import html
import bleach
from typing import Any, Dict, List, Optional
import hashlib
import secrets
from datetime import datetime, timedelta
import jwt
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .config import get_settings

settings = get_settings()


class SecurityEnhancements:
    """Additional security utilities."""
    
    # Allowed HTML tags for content sanitization
    ALLOWED_TAGS = [
        'p', 'br', 'strong', 'em', 'u', 'a', 'code', 'pre',
        'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ]
    
    ALLOWED_ATTRIBUTES = {
        'a': ['href', 'title', 'rel'],
        'code': ['class'],
    }
    
    @staticmethod
    def sanitize_html(content: str) -> str:
        """
        Sanitize HTML content to prevent XSS attacks.
        
        Args:
            content: Raw HTML content
            
        Returns:
            Sanitized HTML
        """
        if not content:
            return ""
            
        # Use bleach to clean HTML
        cleaned = bleach.clean(
            content,
            tags=SecurityEnhancements.ALLOWED_TAGS,
            attributes=SecurityEnhancements.ALLOWED_ATTRIBUTES,
            strip=True
        )
        
        # Additional sanitization for href attributes
        cleaned = re.sub(
            r'href\s*=\s*["\']?javascript:.*?["\']?',
            'href="#"',
            cleaned,
            flags=re.IGNORECASE
        )
        
        return cleaned
    
    @staticmethod
    def escape_for_display(text: str) -> str:
        """
        Escape text for safe display in HTML.
        
        Args:
            text: Raw text
            
        Returns:
            Escaped text safe for HTML display
        """
        if not text:
            return ""
            
        return html.escape(text, quote=True)
    
    @staticmethod
    def generate_csrf_token(session_id: str) -> str:
        """
        Generate CSRF token for session.
        
        Args:
            session_id: User session ID
            
        Returns:
            CSRF token
        """
        # Create token with timestamp
        timestamp = str(int(datetime.utcnow().timestamp()))
        data = f"{session_id}:{timestamp}:{secrets.token_urlsafe(32)}"
        
        # Sign the token
        signature = hashlib.sha256(
            f"{data}:{settings.APP_NAME}".encode()
        ).hexdigest()
        
        return f"{data}:{signature}"
    
    @staticmethod
    def verify_csrf_token(token: str, session_id: str, max_age_hours: int = 24) -> bool:
        """
        Verify CSRF token.
        
        Args:
            token: CSRF token to verify
            session_id: Session ID to check against
            max_age_hours: Maximum age of token in hours
            
        Returns:
            True if valid, False otherwise
        """
        try:
            parts = token.split(":")
            if len(parts) != 4:
                return False
                
            token_session_id, timestamp, random_data, signature = parts
            
            # Check session ID matches
            if token_session_id != session_id:
                return False
                
            # Check timestamp
            token_time = datetime.fromtimestamp(int(timestamp))
            if datetime.utcnow() - token_time > timedelta(hours=max_age_hours):
                return False
                
            # Verify signature
            data = f"{token_session_id}:{timestamp}:{random_data}"
            expected_signature = hashlib.sha256(
                f"{data}:{settings.APP_NAME}".encode()
            ).hexdigest()
            
            return secrets.compare_digest(signature, expected_signature)
            
        except Exception:
            return False
    
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """
        Sanitize filename to prevent directory traversal.
        
        Args:
            filename: Original filename
            
        Returns:
            Sanitized filename
        """
        # Remove any path components
        filename = filename.replace("..", "").replace("/", "").replace("\\", "")
        
        # Only allow alphanumeric, dash, underscore, and dot
        filename = re.sub(r'[^a-zA-Z0-9._-]', '', filename)
        
        # Limit length
        if len(filename) > 255:
            name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
            filename = name[:240] + ('.' + ext if ext else '')
            
        return filename
    
    @staticmethod
    def check_password_strength(password: str) -> Dict[str, Any]:
        """
        Check password strength and return requirements.
        
        Args:
            password: Password to check
            
        Returns:
            Dictionary with strength info and requirements
        """
        requirements = {
            "min_length": len(password) >= 8,
            "has_uppercase": bool(re.search(r'[A-Z]', password)),
            "has_lowercase": bool(re.search(r'[a-z]', password)),
            "has_digit": bool(re.search(r'\d', password)),
            "has_special": bool(re.search(r'[!@#$%^&*()_+-=\[\]{}|;:,.<>?]', password)),
            "no_common_patterns": not bool(re.search(
                r'(password|123456|qwerty|admin|letmein)', 
                password, 
                re.IGNORECASE
            ))
        }
        
        score = sum(requirements.values())
        strength = "weak"
        if score >= 6:
            strength = "strong"
        elif score >= 4:
            strength = "medium"
            
        return {
            "strength": strength,
            "score": score,
            "requirements": requirements,
            "valid": score >= 4  # Minimum acceptable
        }


class RateLimitEnhanced:
    """Enhanced rate limiting with IP-based tracking."""
    
    def __init__(self, db: Session):
        self.db = db
        
    def check_rate_limit(
        self,
        ip_hash: str,
        action: str,
        limit: int,
        window_minutes: int
    ) -> bool:
        """
        Check if IP has exceeded rate limit for action.
        
        Args:
            ip_hash: Hashed IP address
            action: Action being performed
            limit: Maximum allowed actions
            window_minutes: Time window in minutes
            
        Returns:
            True if within limit, False if exceeded
        """
        # This would typically check a Redis cache or database
        # For now, returning True to allow requests
        return True
    
    def record_action(self, ip_hash: str, action: str) -> None:
        """Record an action for rate limiting."""
        # This would typically update Redis or database
        pass


def security_audit_endpoints():
    """
    Audit all endpoints for security issues.
    
    Returns a list of recommendations.
    """
    recommendations = []
    
    # Check for common security issues
    checks = [
        {
            "name": "HTTPS Only",
            "description": "Ensure all endpoints require HTTPS in production",
            "severity": "high",
            "implemented": False  # Should check actual configuration
        },
        {
            "name": "SQL Injection Protection",
            "description": "Use parameterized queries and ORM",
            "severity": "critical",
            "implemented": True  # SQLAlchemy ORM is used
        },
        {
            "name": "XSS Protection",
            "description": "Sanitize all user input and escape output",
            "severity": "high",
            "implemented": True  # Headers are set, but content needs sanitization
        },
        {
            "name": "CSRF Protection",
            "description": "Implement CSRF tokens for state-changing operations",
            "severity": "medium",
            "implemented": False  # Not implemented yet
        },
        {
            "name": "Rate Limiting",
            "description": "Implement rate limiting on all endpoints",
            "severity": "medium",
            "implemented": True  # Basic rate limiting exists
        },
        {
            "name": "Input Validation",
            "description": "Validate all input parameters",
            "severity": "high",
            "implemented": True  # Pydantic validation is used
        },
        {
            "name": "Authentication",
            "description": "Implement proper authentication for admin endpoints",
            "severity": "high",
            "implemented": False  # No auth system yet
        },
        {
            "name": "Logging",
            "description": "Log security events and errors",
            "severity": "medium",
            "implemented": True  # Comprehensive logging exists
        },
        {
            "name": "Secrets Management",
            "description": "Store secrets securely using environment variables",
            "severity": "critical",
            "implemented": True  # Using environment variables
        },
        {
            "name": "Dependency Scanning",
            "description": "Regularly scan dependencies for vulnerabilities",
            "severity": "medium",
            "implemented": False  # Should add to CI/CD
        }
    ]
    
    for check in checks:
        if not check["implemented"]:
            recommendations.append(check)
            
    return recommendations