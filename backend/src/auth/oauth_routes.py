"""
OAuth authentication routes.
"""

import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from ..db.session import get_db
from ..cache.cache_manager import get_cache_manager, CacheManager
from .auth_service import AuthService
from .oauth_service import OAuthService
from .twofa_service import TwoFactorService
from .dependencies import CurrentUser, get_auth_service, get_current_user_optional
from ..models.oauth import OAuthProvider, OAuthAccount, TwoFactorAuth
from ..models.user import User

router = APIRouter(prefix="/auth/oauth", tags=["oauth"])


class OAuthState(BaseModel):
    """OAuth state stored in cache."""
    provider: str
    redirect_uri: Optional[str] = None
    link_account: bool = False
    user_id: Optional[int] = None


class OAuthCallback(BaseModel):
    """OAuth callback parameters."""
    code: str
    state: str


class TwoFactorSetup(BaseModel):
    """2FA setup response."""
    secret: str
    qr_code: str
    backup_codes: Optional[List[str]] = None


class TwoFactorVerify(BaseModel):
    """2FA verification request."""
    token: str


class LinkedAccount(BaseModel):
    """Linked OAuth account info."""
    provider: str
    provider_account_id: str
    linked_at: datetime
    
    class Config:
        from_attributes = True


@router.get("/providers")
async def get_oauth_providers():
    """Get list of available OAuth providers."""
    from .oauth_service import OAuthConfig
    
    providers = []
    for provider in OAuthProvider:
        config = getattr(OAuthConfig, provider.value.upper())
        if config["client_id"]:  # Only show configured providers
            providers.append({
                "id": provider.value,
                "name": provider.value.capitalize(),
                "enabled": True
            })
    
    return {"providers": providers}


@router.get("/authorize/{provider}")
async def oauth_authorize(
    provider: str,
    redirect_uri: Optional[str] = Query(None),
    link_account: bool = Query(False),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service),
    cache: CacheManager = Depends(get_cache_manager)
):
    """Initialize OAuth flow."""
    try:
        oauth_provider = OAuthProvider(provider.lower())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}"
        )
    
    # Generate state token
    state = secrets.token_urlsafe(32)
    
    # Store state in cache
    state_data = OAuthState(
        provider=provider,
        redirect_uri=redirect_uri,
        link_account=link_account,
        user_id=current_user.id if current_user and link_account else None
    )
    
    cache.set(f"oauth_state:{state}", state_data.dict(), expire=600)  # 10 minutes
    
    # Get authorization URL
    oauth_service = OAuthService(db, auth_service)
    auth_url = oauth_service.get_authorization_url(oauth_provider, state)
    
    return {"authorization_url": auth_url}


@router.post("/callback/{provider}")
async def oauth_callback(
    provider: str,
    callback: OAuthCallback,
    response: Response,
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service),
    cache: CacheManager = Depends(get_cache_manager)
):
    """Handle OAuth callback."""
    try:
        oauth_provider = OAuthProvider(provider.lower())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}"
        )
    
    # Verify state
    state_data = cache.get(f"oauth_state:{callback.state}")
    if not state_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired state"
        )
    
    # Clear state from cache
    cache.delete(f"oauth_state:{callback.state}")
    
    state = OAuthState(**state_data)
    
    oauth_service = OAuthService(db, auth_service)
    
    if state.link_account and state.user_id:
        # Link account to existing user
        user = db.query(User).filter(User.id == state.user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Get user info to link
        token_data = await oauth_service.exchange_code_for_token(oauth_provider, callback.code)
        user_info = await oauth_service.get_user_info(
            oauth_provider, 
            token_data["access_token"]
        )
        
        oauth_service.link_oauth_account(
            user,
            oauth_provider,
            user_info.provider_id,
            token_data["access_token"],
            token_data.get("refresh_token"),
            token_data.get("expires_in"),
            user_info.provider_data
        )
        
        return {"message": f"{provider} account linked successfully"}
    
    else:
        # Authenticate user
        user, tokens = await oauth_service.authenticate_oauth_user(
            oauth_provider,
            callback.code
        )
        
        # Set refresh token cookie
        response.set_cookie(
            key="refresh_token",
            value=tokens["refresh_token"],
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=7 * 24 * 60 * 60  # 7 days
        )
        
        return tokens


@router.get("/linked-accounts", response_model=List[LinkedAccount])
async def get_linked_accounts(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Get user's linked OAuth accounts."""
    accounts = db.query(OAuthAccount).filter(
        OAuthAccount.user_id == current_user.id
    ).all()
    
    return [
        LinkedAccount(
            provider=account.provider.value,
            provider_account_id=account.provider_account_id,
            linked_at=account.created_at
        )
        for account in accounts
    ]


@router.delete("/unlink/{provider}")
async def unlink_oauth_account(
    provider: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service)
):
    """Unlink an OAuth account."""
    try:
        oauth_provider = OAuthProvider(provider.lower())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}"
        )
    
    oauth_service = OAuthService(db, auth_service)
    oauth_service.unlink_oauth_account(current_user, oauth_provider)
    
    return {"message": f"{provider} account unlinked successfully"}


# Two-Factor Authentication Routes

@router.post("/2fa/setup", response_model=TwoFactorSetup)
async def setup_2fa(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Set up two-factor authentication."""
    twofa_service = TwoFactorService(db)
    
    # Check if already enabled
    if twofa_service.is_2fa_enabled(current_user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled"
        )
    
    secret, provisioning_uri = twofa_service.setup_totp(current_user)
    qr_code = twofa_service.generate_qr_code(provisioning_uri)
    
    return TwoFactorSetup(
        secret=secret,
        qr_code=f"data:image/png;base64,{qr_code}"
    )


@router.post("/2fa/verify")
async def verify_2fa(
    verification: TwoFactorVerify,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Verify and enable 2FA."""
    twofa_service = TwoFactorService(db)
    
    if twofa_service.verify_and_enable_totp(current_user, verification.token):
        # Get backup codes
        backup_codes = twofa_service.get_backup_codes(current_user)
        
        return {
            "message": "2FA enabled successfully",
            "backup_codes": backup_codes
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code"
        )


@router.post("/2fa/disable")
async def disable_2fa(
    verification: TwoFactorVerify,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Disable 2FA (requires current 2FA code)."""
    twofa_service = TwoFactorService(db)
    
    # Verify current 2FA code
    if not twofa_service.verify_totp(current_user, verification.token):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code"
        )
    
    twofa_service.disable_totp(current_user)
    
    return {"message": "2FA disabled successfully"}


@router.get("/2fa/backup-codes")
async def regenerate_backup_codes(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Regenerate backup codes."""
    twofa_service = TwoFactorService(db)
    
    backup_codes = twofa_service.get_backup_codes(current_user)
    
    return {
        "backup_codes": backup_codes,
        "message": "New backup codes generated. Please save them securely."
    }


@router.get("/2fa/status")
async def get_2fa_status(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Get 2FA status for current user."""
    twofa_service = TwoFactorService(db)
    
    two_fa = db.query(TwoFactorAuth).filter(
        TwoFactorAuth.user_id == current_user.id
    ).first()
    
    return {
        "enabled": two_fa and two_fa.totp_enabled,
        "backup_codes_count": len(two_fa.backup_codes) if two_fa and two_fa.backup_codes else 0
    }