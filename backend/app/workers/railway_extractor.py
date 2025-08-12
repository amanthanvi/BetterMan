#!/usr/bin/env python3
"""
Railway-specific man page extractor that runs as a cron job.
Designed to work with Railway's environment and PostgreSQL.
"""

import os
import sys
import logging
import asyncio
import subprocess
from datetime import datetime, timezone
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_path))

# Import after path setup
from app.workers.extractor import ManPageExtractor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s:%(name)s:%(message)s'
)
logger = logging.getLogger(__name__)


def install_system_packages():
    """Install required system packages for man page extraction."""
    packages = [
        'man-db',
        'manpages',
        'manpages-dev',
        # Ubuntu 24.04 packages that contain man pages
        'coreutils',  # ls, cp, mv, rm, etc.
        'util-linux',  # mount, fdisk, etc.
        'procps',  # ps, top, kill, etc.
        'net-tools',  # netstat, ifconfig, etc.
        'iproute2',  # ip, ss, etc.
        'findutils',  # find, xargs, etc.
        'grep',  # grep, egrep, fgrep
        'sed',  # sed
        'gawk',  # awk
        'diffutils',  # diff, cmp, etc.
        'tar',  # tar
        'gzip',  # gzip, gunzip
        'bzip2',  # bzip2, bunzip2
        'xz-utils',  # xz compression
        'curl',  # curl
        'wget',  # wget
        'openssh-client',  # ssh, scp, sftp
        'git',  # git
        'vim',  # vim
        'nano',  # nano
        'less',  # less, more
    ]
    
    try:
        # Update package list
        subprocess.run(['apt-get', 'update'], check=True, capture_output=True)
        
        # Install packages (continue even if some fail)
        result = subprocess.run(
            ['apt-get', 'install', '-y'] + packages,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            logger.warning(f"Some packages may have failed to install: {result.stderr}")
        else:
            logger.info("System packages installed successfully")
            
        # Update man database after installing packages
        logger.info("Updating man database...")
        subprocess.run(['mandb'], capture_output=True, text=True)
        logger.info("Man database updated")
        
        # Verify installation - check what man pages are available
        logger.info("Verifying man page installation...")
        for cmd in ['ls', 'grep', 'curl', 'git', 'tar', 'ps']:
            result = subprocess.run(['man', '-w', cmd], capture_output=True, text=True)
            if result.returncode == 0:
                logger.info(f"✓ Found man page for {cmd}: {result.stdout.strip()}")
            else:
                logger.warning(f"✗ Missing man page for {cmd}")
                
        # List sample man1 pages
        result = subprocess.run(['ls', '/usr/share/man/man1/'], capture_output=True, text=True)
        if result.returncode == 0:
            files = result.stdout.split('\n')[:10]  # First 10 files
            logger.info(f"Sample man1 pages: {', '.join(files)}")
            
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to install packages: {e}")
    except FileNotFoundError:
        logger.warning("apt-get not found, skipping package installation")


async def main():
    """Main entry point for Railway extractor."""
    logger.info(f"Railway extractor job started at {datetime.now(timezone.utc)}")
    
    # Get database URL from environment
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        logger.error("DATABASE_URL not set")
        sys.exit(1)
    
    # Log connection info (without password)
    from urllib.parse import urlparse
    parsed = urlparse(db_url)
    logger.info(f"Database URL configured: {parsed.hostname}:{parsed.port}/{parsed.path.lstrip('/')}")
    
    # Get Redis URL (optional)
    redis_url = os.environ.get('REDIS_URL')
    
    # Always install system packages in the container
    logger.info("Installing system packages...")
    install_system_packages()
    
    # Determine extraction mode
    extraction_mode = os.environ.get('EXTRACTION_MODE', 'incremental')
    incremental = extraction_mode != 'full'
    
    try:
        # Create extractor instance
        extractor = ManPageExtractor(db_url, redis_url)
        
        # Run extraction
        logger.info("Starting Railway man page extraction job")
        start_time = datetime.now()
        
        await extractor.run_extraction(incremental=incremental)
        
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"Job completed in {elapsed:.2f} seconds")
        
    except Exception as e:
        logger.error(f"Extraction failed: {e}", exc_info=True)
        sys.exit(1)
    
    logger.info("Extraction completed successfully")


if __name__ == "__main__":
    # Print startup message
    print("🔍 Starting Man Page Extractor...")
    print(f"Database URL: {os.environ.get('DATABASE_URL', 'Not set')[:50]}...")
    print("Installing man page packages...")
    
    # Run the async main function
    asyncio.run(main())