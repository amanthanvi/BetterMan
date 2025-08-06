"""
Two-factor authentication service.
"""

import pyotp
import qrcode
import io
import base64
import json
import secrets
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
import bcrypt

from ..models.user import User
from ..models.oauth import TwoFactorAuth
from ..config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()


class TwoFactorService:
    """Service for managing two-factor authentication."""
    
    def __init__(self, db):
        self.db = db
        self.issuer = "BetterMan"
    
    def setup_totp(self, user: User) -> Tuple[str, str]:
        """
        Set up TOTP (Time-based One-Time Password) for user.
        Returns (secret, provisioning_uri).
        """
        # Get or create 2FA record
        two_fa = self.db.query(TwoFactorAuth).filter(
            TwoFactorAuth.user_id == user.id
        ).first()
        
        if not two_fa:
            two_fa = TwoFactorAuth(user_id=user.id)
            self.db.add(two_fa)
        
        # Generate new secret
        secret = pyotp.random_base32()
        two_fa.totp_secret = secret
        
        # Don't enable yet - user must verify first
        two_fa.totp_enabled = False
        
        self.db.commit()
        
        # Generate provisioning URI for QR code
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=user.email,
            issuer_name=self.issuer
        )
        
        logger.info(f"Set up TOTP for user {user.username}")
        
        return secret, provisioning_uri
    
    def generate_qr_code(self, provisioning_uri: str) -> str:
        """Generate QR code image as base64 string."""
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(provisioning_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        return base64.b64encode(buffer.getvalue()).decode()
    
    def verify_and_enable_totp(self, user: User, token: str) -> bool:
        """Verify TOTP token and enable 2FA if valid."""
        two_fa = self.db.query(TwoFactorAuth).filter(
            TwoFactorAuth.user_id == user.id
        ).first()
        
        if not two_fa or not two_fa.totp_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="TOTP not set up"
            )
        
        # Verify token
        totp = pyotp.TOTP(two_fa.totp_secret)
        if not totp.verify(token, valid_window=1):
            return False
        
        # Enable TOTP
        two_fa.totp_enabled = True
        
        # Generate backup codes
        backup_codes = self._generate_backup_codes()
        two_fa.backup_codes = json.dumps([
            bcrypt.hashpw(code.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            for code in backup_codes
        ])
        
        self.db.commit()
        
        logger.info(f"Enabled TOTP for user {user.username}")
        
        return True
    
    def verify_totp(self, user: User, token: str) -> bool:
        """Verify TOTP token."""
        two_fa = self.db.query(TwoFactorAuth).filter(
            TwoFactorAuth.user_id == user.id
        ).first()
        
        if not two_fa or not two_fa.totp_enabled or not two_fa.totp_secret:
            return False
        
        totp = pyotp.TOTP(two_fa.totp_secret)
        return totp.verify(token, valid_window=1)
    
    def disable_totp(self, user: User):
        """Disable TOTP for user."""
        two_fa = self.db.query(TwoFactorAuth).filter(
            TwoFactorAuth.user_id == user.id
        ).first()
        
        if two_fa:
            two_fa.totp_enabled = False
            two_fa.totp_secret = None
            two_fa.backup_codes = None
            self.db.commit()
            
            logger.info(f"Disabled TOTP for user {user.username}")
    
    def get_backup_codes(self, user: User) -> List[str]:
        """Get user's backup codes (returns new ones if regenerating)."""
        two_fa = self.db.query(TwoFactorAuth).filter(
            TwoFactorAuth.user_id == user.id
        ).first()
        
        if not two_fa or not two_fa.totp_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="2FA not enabled"
            )
        
        # Generate new backup codes
        backup_codes = self._generate_backup_codes()
        
        # Hash and store them
        two_fa.backup_codes = json.dumps([
            bcrypt.hashpw(code.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            for code in backup_codes
        ])
        
        self.db.commit()
        
        logger.info(f"Regenerated backup codes for user {user.username}")
        
        return backup_codes
    
    def verify_backup_code(self, user: User, code: str) -> bool:
        """Verify and consume a backup code."""
        two_fa = self.db.query(TwoFactorAuth).filter(
            TwoFactorAuth.user_id == user.id
        ).first()
        
        if not two_fa or not two_fa.backup_codes:
            return False
        
        hashed_codes = json.loads(two_fa.backup_codes)
        
        # Check each code
        for i, hashed_code in enumerate(hashed_codes):
            if bcrypt.checkpw(code.encode('utf-8'), hashed_code.encode('utf-8')):
                # Remove used code
                hashed_codes.pop(i)
                two_fa.backup_codes = json.dumps(hashed_codes)
                self.db.commit()
                
                logger.info(f"User {user.username} used backup code")
                
                return True
        
        return False
    
    def is_2fa_enabled(self, user: User) -> bool:
        """Check if user has 2FA enabled."""
        two_fa = self.db.query(TwoFactorAuth).filter(
            TwoFactorAuth.user_id == user.id
        ).first()
        
        return two_fa and two_fa.totp_enabled
    
    def _generate_backup_codes(self, count: int = 8) -> List[str]:
        """Generate backup codes."""
        codes = []
        for _ in range(count):
            # Generate 8-character alphanumeric codes
            code = ''.join(secrets.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') for _ in range(8))
            # Format as XXXX-XXXX
            formatted = f"{code[:4]}-{code[4:]}"
            codes.append(formatted)
        
        return codes