#!/usr/bin/env python3
"""
Generate secure secrets for production deployment.
"""

import secrets
import os
import sys
from pathlib import Path


def generate_secret_key(length=32):
    """Generate a secure secret key."""
    return secrets.token_urlsafe(length)


def generate_env_file(env_type="production"):
    """Generate environment file with secure secrets."""
    
    # Generate secrets
    secret_key = generate_secret_key(64)  # Extra long for security
    redis_password = generate_secret_key(32)
    
    # Define environment configurations
    configs = {
        "development": {
            "SECRET_KEY": secret_key,
            "JWT_ALGORITHM": "HS256",
            "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
            "REFRESH_TOKEN_EXPIRE_DAYS": "7",
            "DATABASE_URL": "sqlite:///./data/betterman.db",
            "REDIS_URL": f"redis://:{redis_password}@redis:6379/0",
            "REDIS_HOST": "redis",
            "REDIS_PORT": "6379",
            "REDIS_DB": "0",
            "REDIS_PASSWORD": redis_password,
            "APP_NAME": "BetterMan",
            "APP_VERSION": "1.0.0",
            "DEBUG": "false",
            "ENVIRONMENT": "development",
            "LOG_LEVEL": "INFO",
            "CORS_ORIGINS": "http://localhost:5173,http://localhost:3000",
            "CACHE_DIR": ".cache",
            "CACHE_TTL": "3600",
            "SENTRY_DSN": "",  # Add your Sentry DSN here
            "ALLOWED_HOSTS": "localhost,127.0.0.1",
            "SESSION_COOKIE_SECURE": "false",  # False for development
        },
        "production": {
            "SECRET_KEY": secret_key,
            "JWT_ALGORITHM": "HS256",
            "ACCESS_TOKEN_EXPIRE_MINUTES": "15",  # Shorter for production
            "REFRESH_TOKEN_EXPIRE_DAYS": "30",   # Longer refresh
            "DATABASE_URL": "postgresql://user:password@db:5432/betterman",
            "REDIS_URL": f"redis://:{redis_password}@redis:6379/0",
            "REDIS_HOST": "redis",
            "REDIS_PORT": "6379",
            "REDIS_DB": "0",
            "REDIS_PASSWORD": redis_password,
            "APP_NAME": "BetterMan",
            "APP_VERSION": "1.0.0",
            "DEBUG": "false",
            "ENVIRONMENT": "production",
            "LOG_LEVEL": "WARNING",
            "CORS_ORIGINS": "https://betterman.example.com",
            "CACHE_DIR": "/var/cache/betterman",
            "CACHE_TTL": "7200",
            "SENTRY_DSN": "",  # Add your Sentry DSN here
            "ALLOWED_HOSTS": "betterman.example.com,api.betterman.example.com",
            "SESSION_COOKIE_SECURE": "true",
            "RATE_LIMIT_ENABLED": "true",
            "METRICS_ENABLED": "true",
        }
    }
    
    config = configs.get(env_type, configs["production"])
    
    # Generate .env file content
    env_content = f"""# BetterMan Environment Configuration
# Generated for: {env_type}
# IMPORTANT: Keep this file secure and never commit to version control!

# Security (CRITICAL - Change these in production!)
SECRET_KEY={config['SECRET_KEY']}
JWT_ALGORITHM={config['JWT_ALGORITHM']}
ACCESS_TOKEN_EXPIRE_MINUTES={config['ACCESS_TOKEN_EXPIRE_MINUTES']}
REFRESH_TOKEN_EXPIRE_DAYS={config['REFRESH_TOKEN_EXPIRE_DAYS']}

# Database
DATABASE_URL={config['DATABASE_URL']}

# Redis Cache
REDIS_URL={config['REDIS_URL']}
REDIS_HOST={config['REDIS_HOST']}
REDIS_PORT={config['REDIS_PORT']}
REDIS_DB={config['REDIS_DB']}
REDIS_PASSWORD={config['REDIS_PASSWORD']}

# Application
APP_NAME={config['APP_NAME']}
APP_VERSION={config['APP_VERSION']}
DEBUG={config['DEBUG']}
ENVIRONMENT={config['ENVIRONMENT']}
LOG_LEVEL={config['LOG_LEVEL']}

# CORS
CORS_ORIGINS={config['CORS_ORIGINS']}
ALLOWED_HOSTS={config['ALLOWED_HOSTS']}

# Cache
CACHE_DIR={config['CACHE_DIR']}
CACHE_TTL={config['CACHE_TTL']}

# Security Headers
SESSION_COOKIE_SECURE={config['SESSION_COOKIE_SECURE']}

# Monitoring
SENTRY_DSN={config['SENTRY_DSN']}

# Rate Limiting
RATE_LIMIT_ENABLED={config.get('RATE_LIMIT_ENABLED', 'true')}

# Metrics
METRICS_ENABLED={config.get('METRICS_ENABLED', 'true')}
"""
    
    return env_content, secret_key, redis_password


def main():
    """Main function."""
    # Check command line arguments
    env_type = sys.argv[1] if len(sys.argv) > 1 else "production"
    
    if env_type not in ["development", "production"]:
        print("Usage: python generate_secrets.py [development|production]")
        sys.exit(1)
    
    # Generate environment file
    env_content, secret_key, redis_password = generate_env_file(env_type)
    
    # Determine output filename
    output_file = f".env.{env_type}"
    if env_type == "development" and not os.path.exists(".env"):
        output_file = ".env"
    
    # Write to file
    with open(output_file, "w") as f:
        f.write(env_content)
    
    print(f"✓ Generated {output_file}")
    print(f"✓ Secret Key (first 20 chars): {secret_key[:20]}...")
    print(f"✓ Redis Password (first 10 chars): {redis_password[:10]}...")
    print()
    print("IMPORTANT:")
    print("1. Keep these secrets secure!")
    print("2. Never commit .env files to version control")
    print("3. Use different secrets for each environment")
    print("4. Rotate secrets regularly")
    print("5. Update DATABASE_URL for production PostgreSQL")
    
    # Create .env.example if it doesn't exist
    example_file = ".env.example"
    if not os.path.exists(example_file):
        example_content = """# BetterMan Environment Configuration Example
# Copy this file to .env and update with your values

# Security (REQUIRED - Generate with generate_secrets.py)
SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Database
DATABASE_URL=sqlite:///./data/betterman.db
# For PostgreSQL: postgresql://user:password@host:port/dbname

# Redis Cache (Optional but recommended)
REDIS_URL=redis://redis:6379/0
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

# Application
APP_NAME=BetterMan
APP_VERSION=1.0.0
DEBUG=false
ENVIRONMENT=development
LOG_LEVEL=INFO

# CORS (Update for your domains)
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
ALLOWED_HOSTS=localhost,127.0.0.1

# Cache
CACHE_DIR=.cache
CACHE_TTL=3600

# Security Headers
SESSION_COOKIE_SECURE=false

# Monitoring (Optional)
SENTRY_DSN=

# Rate Limiting
RATE_LIMIT_ENABLED=true

# Metrics
METRICS_ENABLED=true
"""
        with open(example_file, "w") as f:
            f.write(example_content)
        print(f"\n✓ Created {example_file}")
    
    # Update .gitignore to ensure .env files are not committed
    gitignore_path = Path("../.gitignore")
    if gitignore_path.exists():
        with open(gitignore_path, "r") as f:
            gitignore_content = f.read()
        
        env_patterns = [".env", ".env.*", "!.env.example"]
        patterns_to_add = []
        
        for pattern in env_patterns:
            if pattern not in gitignore_content:
                patterns_to_add.append(pattern)
        
        if patterns_to_add:
            with open(gitignore_path, "a") as f:
                f.write("\n# Environment files\n")
                for pattern in patterns_to_add:
                    f.write(f"{pattern}\n")
            print(f"\n✓ Updated .gitignore")


if __name__ == "__main__":
    main()