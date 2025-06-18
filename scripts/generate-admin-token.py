#!/usr/bin/env python3
"""Generate a secure admin token for BetterMan API."""

import secrets
import string
import base64
import hashlib
import uuid

def generate_token(length=32):
    """Generate a secure random token."""
    # Method 1: Using secrets (recommended)
    return secrets.token_urlsafe(length)

def generate_hex_token(length=32):
    """Generate a hex token."""
    # Method 2: Hex token
    return secrets.token_hex(length)

def generate_custom_token(length=48):
    """Generate a custom format token."""
    # Method 3: Custom alphanumeric
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_uuid_token():
    """Generate a UUID-based token."""
    # Method 4: UUID-based
    return str(uuid.uuid4())

def generate_hash_token():
    """Generate a hash-based token with timestamp."""
    # Method 5: Hash with salt
    salt = secrets.token_bytes(16)
    data = f"{uuid.uuid4()}-{secrets.randbits(256)}".encode()
    return hashlib.sha256(salt + data).hexdigest()

if __name__ == "__main__":
    print("🔐 BetterMan Admin Token Generator\n")
    
    print("Choose your token format:")
    print("1. URL-safe token (recommended)")
    print("2. Hex token")
    print("3. Alphanumeric token")
    print("4. UUID token")
    print("5. SHA256 hash token")
    
    tokens = {
        "1": ("URL-safe", generate_token()),
        "2": ("Hex", generate_hex_token()),
        "3": ("Alphanumeric", generate_custom_token()),
        "4": ("UUID", generate_uuid_token()),
        "5": ("SHA256", generate_hash_token())
    }
    
    print("\nGenerated tokens:\n")
    for num, (name, token) in tokens.items():
        print(f"{num}. {name} ({len(token)} chars):")
        print(f"   {token}\n")
    
    print("\n📋 Quick copy commands:\n")
    recommended = tokens["1"][1]
    print(f"export ADMIN_TOKEN='{recommended}'")
    print(f"\n# Or add to .env file:")
    print(f"echo 'ADMIN_TOKEN={recommended}' >> .env")
    
    print("\n🚀 To set in Vercel:")
    print("1. Go to https://vercel.com/[your-username]/[your-project]/settings/environment-variables")
    print("2. Add new variable:")
    print("   - Name: ADMIN_TOKEN")
    print(f"   - Value: {recommended}")
    print("   - Environment: Production (or all)")
    print("3. Save and redeploy")