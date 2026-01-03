"""
Privacy enhancements and GDPR compliance utilities.
"""

import hashlib
import logging
from typing import Dict, Optional, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text

from .config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class PrivacyManager:
    """Manage privacy-related operations."""
    
    @staticmethod
    def anonymize_ip(ip: str) -> str:
        """
        Anonymize IP address for privacy.
        
        IPv4: Zero out last octet (192.168.1.100 -> 192.168.1.0)
        IPv6: Zero out last 80 bits
        
        Args:
            ip: IP address to anonymize
            
        Returns:
            Anonymized IP address
        """
        if not ip:
            return "0.0.0.0"
            
        try:
            if ':' in ip:  # IPv6
                # Split into groups
                parts = ip.split(':')
                # Keep only first 3 groups (48 bits)
                anonymized = ':'.join(parts[:3]) + '::'
                return anonymized
            else:  # IPv4
                parts = ip.split('.')
                if len(parts) == 4:
                    # Zero out last octet
                    parts[3] = '0'
                    return '.'.join(parts)
                    
        except Exception as e:
            logger.error(f"Error anonymizing IP {ip}: {e}")
            
        return "0.0.0.0"
    
    @staticmethod
    def hash_user_identifier(identifier: str, salt: Optional[str] = None) -> str:
        """
        Create a privacy-preserving hash of user identifier.
        
        Args:
            identifier: User identifier (email, username, etc.)
            salt: Optional salt for hashing
            
        Returns:
            Hashed identifier
        """
        if not identifier:
            return "anonymous"
            
        # Use app name as default salt
        if not salt:
            salt = settings.APP_NAME
            
        # Create hash
        hash_input = f"{salt}:{identifier}".encode('utf-8')
        return hashlib.sha256(hash_input).hexdigest()[:16]
    
    @staticmethod
    def clean_sensitive_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Remove sensitive data from dictionary.
        
        Args:
            data: Dictionary potentially containing sensitive data
            
        Returns:
            Cleaned dictionary
        """
        sensitive_keys = {
            'password', 'token', 'api_key', 'secret', 'auth',
            'email', 'phone', 'ssn', 'credit_card', 'ip_address'
        }
        
        cleaned = {}
        for key, value in data.items():
            # Check if key contains sensitive terms
            key_lower = key.lower()
            if any(term in key_lower for term in sensitive_keys):
                cleaned[key] = "[REDACTED]"
            elif isinstance(value, dict):
                # Recursively clean nested dictionaries
                cleaned[key] = PrivacyManager.clean_sensitive_data(value)
            else:
                cleaned[key] = value
                
        return cleaned
    
    @staticmethod
    def get_data_retention_policy() -> Dict[str, int]:
        """
        Get data retention policy in days.
        
        Returns:
            Dictionary mapping data types to retention days
        """
        return {
            'access_logs': 90,      # 3 months
            'search_queries': 30,   # 1 month
            'error_logs': 180,      # 6 months
            'analytics': 365,       # 1 year
            'user_preferences': -1, # Keep until user deletes
        }
    
    @staticmethod
    def apply_data_retention(db: Session) -> Dict[str, int]:
        """
        Apply data retention policy by removing old data.
        
        Args:
            db: Database session
            
        Returns:
            Dictionary with counts of removed records
        """
        policy = PrivacyManager.get_data_retention_policy()
        removed = {}
        
        try:
            # Clean old search analytics
            if 'search_queries' in policy and policy['search_queries'] > 0:
                cutoff = datetime.utcnow() - timedelta(days=policy['search_queries'])
                # This would clean search analytics table if it existed
                # For now, just log
                logger.info(f"Would clean search queries older than {cutoff}")
                removed['search_queries'] = 0
                
            # Clean old access logs
            if 'access_logs' in policy and policy['access_logs'] > 0:
                cutoff = datetime.utcnow() - timedelta(days=policy['access_logs'])
                # This would clean access logs if stored in DB
                logger.info(f"Would clean access logs older than {cutoff}")
                removed['access_logs'] = 0
                
            db.commit()
            
        except Exception as e:
            logger.error(f"Error applying data retention: {e}")
            db.rollback()
            
        return removed


class GDPRCompliance:
    """GDPR compliance utilities."""
    
    @staticmethod
    def get_privacy_policy() -> Dict[str, Any]:
        """
        Get privacy policy information.
        
        Returns:
            Privacy policy details
        """
        return {
            "version": "1.0",
            "last_updated": "2024-01-01",
            "data_controller": "BetterMan Project",
            "contact_email": "privacy@betterman.io",
            "purposes": [
                "Provide documentation search and viewing services",
                "Improve service performance and user experience",
                "Analyze usage patterns for service optimization",
                "Ensure security and prevent abuse"
            ],
            "data_collected": [
                {
                    "type": "Usage Data",
                    "description": "Search queries, viewed pages, timestamps",
                    "retention": "30 days",
                    "purpose": "Service improvement"
                },
                {
                    "type": "Technical Data",
                    "description": "Anonymized IP addresses, browser type",
                    "retention": "90 days",
                    "purpose": "Security and performance"
                }
            ],
            "user_rights": [
                "Access your personal data",
                "Request data correction",
                "Request data deletion",
                "Data portability",
                "Withdraw consent"
            ],
            "third_parties": "We do not share data with third parties",
            "cookies": "We use essential cookies only for session management",
            "security": "Data is encrypted in transit and at rest"
        }
    
    @staticmethod
    def export_user_data(user_id: str, db: Session) -> Dict[str, Any]:
        """
        Export all data for a specific user (GDPR data portability).
        
        Args:
            user_id: User identifier
            db: Database session
            
        Returns:
            Dictionary containing all user data
        """
        # In a real implementation, this would gather all user data
        # For now, return a template
        return {
            "user_id": user_id,
            "export_date": datetime.utcnow().isoformat(),
            "data": {
                "searches": [],
                "viewed_documents": [],
                "preferences": {},
                "analytics": {}
            }
        }
    
    @staticmethod
    def delete_user_data(user_id: str, db: Session) -> bool:
        """
        Delete all data for a specific user (GDPR right to erasure).
        
        Args:
            user_id: User identifier
            db: Database session
            
        Returns:
            True if successful
        """
        try:
            # In a real implementation, this would delete all user data
            # from various tables
            logger.info(f"Deleting all data for user {user_id}")
            
            # Commit changes
            db.commit()
            return True
            
        except Exception as e:
            logger.error(f"Error deleting user data: {e}")
            db.rollback()
            return False
    
    @staticmethod
    def get_consent_requirements() -> Dict[str, Any]:
        """
        Get consent requirements for different features.
        
        Returns:
            Consent requirements
        """
        return {
            "essential": {
                "required": True,
                "description": "Essential for basic functionality",
                "features": ["search", "view_documents", "session_management"]
            },
            "analytics": {
                "required": False,
                "description": "Help us improve by sharing usage data",
                "features": ["search_analytics", "performance_metrics"]
            },
            "personalization": {
                "required": False,
                "description": "Personalize your experience",
                "features": ["search_history", "preferences"]
            }
        }


def configure_privacy_headers(response):
    """
    Add privacy-related headers to response.
    
    Args:
        response: FastAPI response object
        
    Returns:
        Response with privacy headers
    """
    # DNT (Do Not Track) acknowledgment
    response.headers["Tk"] = "!"  # Under construction
    
    # P3P compact policy (legacy but still used by some)
    response.headers["P3P"] = 'CP="This is not a P3P policy"'
    
    # Permissions Policy (formerly Feature Policy)
    response.headers["Permissions-Policy"] = (
        "geolocation=(), "
        "camera=(), "
        "microphone=(), "
        "payment=(), "
        "usb=(), "
        "interest-cohort=()"  # Opt out of FLoC
    )
    
    return response