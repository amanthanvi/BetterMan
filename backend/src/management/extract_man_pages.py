#!/usr/bin/env python3
"""
Management command to extract man pages.
Can be run manually or scheduled.
"""

import asyncio
import logging
import sys
import os
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_path))

from app.workers.extractor import ManPageExtractor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def extract_man_pages(incremental: bool = True):
    """Extract man pages to database."""
    db_url = os.getenv('DATABASE_URL', os.getenv('DATABASE_PUBLIC_URL'))
    
    if not db_url:
        # Try to load from .env file
        from dotenv import load_dotenv
        load_dotenv()
        db_url = os.getenv('DATABASE_URL', os.getenv('DATABASE_PUBLIC_URL'))
    
    if not db_url:
        logger.error("No database URL found. Set DATABASE_URL or DATABASE_PUBLIC_URL environment variable.")
        return False
    
    redis_url = os.getenv('REDIS_URL')
    
    try:
        extractor = ManPageExtractor(db_url, redis_url)
        await extractor.run_extraction(incremental=incremental)
        return True
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        return False


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Extract man pages to database')
    parser.add_argument(
        '--full',
        action='store_true',
        help='Run full extraction (not incremental)'
    )
    parser.add_argument(
        '--install-packages',
        action='store_true',
        help='Install system packages first (requires apt)'
    )
    
    args = parser.parse_args()
    
    if args.install_packages:
        import subprocess
        logger.info("Installing system packages...")
        subprocess.run(['apt-get', 'update'], check=True)
        subprocess.run([
            'apt-get', 'install', '-y',
            'man-db', 'manpages', 'manpages-dev',
            'coreutils', 'util-linux', 'procps'
        ], check=True)
    
    success = asyncio.run(extract_man_pages(incremental=not args.full))
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()