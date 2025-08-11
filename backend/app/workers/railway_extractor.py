#!/usr/bin/env python3
"""
Railway-specific man page extractor cron job.
This script is designed to run as a Railway cron job.
"""

import os
import sys
import logging
import asyncio
from datetime import datetime, timezone
import subprocess

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.workers.extractor import ManPageExtractor

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def install_system_packages():
    """Install required system packages in Railway environment."""
    packages = [
        'man-db', 'manpages', 'manpages-dev', 'manpages-posix',
        'coreutils', 'util-linux', 'procps',
        'net-tools', 'iproute2', 'curl', 'wget',
        'git', 'make', 'gcc',
        'gzip', 'bzip2', 'xz-utils'
    ]
    
    logger.info("Installing system packages...")
    
    try:
        # Update package lists
        subprocess.run(['apt-get', 'update', '-qq'], check=True)
        
        # Install packages
        cmd = ['apt-get', 'install', '-y', '-qq', '--no-install-recommends'] + packages
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            logger.info("System packages installed successfully")
        else:
            logger.warning(f"Some packages may have failed to install: {result.stderr}")
            
        # Create man database
        subprocess.run(['mandb', '--create', '--quiet'], check=False)
        
    except Exception as e:
        logger.error(f"Failed to install system packages: {e}")
        # Continue anyway - some packages might already be installed


async def run_extraction():
    """Run the extraction pipeline."""
    logger.info("Starting Railway man page extraction job")
    
    # Get database URL from Railway environment
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        # Try Railway's public URL format
        db_url = os.getenv('DATABASE_PUBLIC_URL')
    
    if not db_url:
        # Build from Railway environment variables
        pg_host = os.getenv('PGHOST', os.getenv('RAILWAY_TCP_PROXY_DOMAIN'))
        pg_port = os.getenv('PGPORT', os.getenv('RAILWAY_TCP_PROXY_PORT', '5432'))
        pg_user = os.getenv('PGUSER', 'postgres')
        pg_password = os.getenv('PGPASSWORD')
        pg_database = os.getenv('PGDATABASE', 'railway')
        
        if pg_host and pg_password:
            db_url = f"postgresql://{pg_user}:{pg_password}@{pg_host}:{pg_port}/{pg_database}"
        else:
            logger.error("Database configuration not found in environment variables")
            sys.exit(1)
    
    logger.info(f"Database URL configured: {db_url.split('@')[1] if '@' in db_url else 'unknown'}")
    
    # Get Redis URL if available
    redis_url = os.getenv('REDIS_URL', os.getenv('REDIS_PUBLIC_URL'))
    
    try:
        # Install system packages first
        if os.getenv('RAILWAY_ENVIRONMENT'):
            install_system_packages()
        
        # Initialize and run extractor
        extractor = ManPageExtractor(db_url, redis_url)
        await extractor.run_extraction(incremental=True)
        
        logger.info("Extraction completed successfully")
        
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        sys.exit(1)


def main():
    """Main entry point."""
    start_time = datetime.now(timezone.utc)
    logger.info(f"Railway extractor job started at {start_time}")
    
    try:
        # Run the async extraction
        asyncio.run(run_extraction())
        
        duration = (datetime.now(timezone.utc) - start_time).total_seconds()
        logger.info(f"Job completed in {duration:.2f} seconds")
        
    except KeyboardInterrupt:
        logger.info("Job interrupted by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Job failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()