#!/usr/bin/env python3
"""
Startup script for DigitalOcean App Platform
Handles database initialization and data loading
"""
import os
import sys
import logging
import subprocess
from pathlib import Path

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from database_appplatform import ensure_database_exists, get_db
from parser.enhanced_man_parser import EnhancedManPageParser

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def load_initial_data():
    """Load initial man page data"""
    logger.info("Loading initial man page data...")
    
    try:
        parser = EnhancedManPageParser()
        
        # Essential commands to load
        essential_commands = [
            'ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'grep',
            'find', 'sed', 'awk', 'sort', 'uniq', 'head', 'tail', 'less', 'more',
            'chmod', 'chown', 'ps', 'kill', 'top', 'df', 'du', 'tar', 'gzip',
            'curl', 'wget', 'ssh', 'scp', 'git', 'vim', 'nano', 'man', 'which',
            'date', 'cal', 'history', 'alias', 'export', 'source', 'bash', 'sh'
        ]
        
        loaded = 0
        with get_db() as conn:
            for cmd in essential_commands:
                try:
                    # Try to get man page content
                    result = subprocess.run(
                        ['man', cmd],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    
                    if result.returncode == 0:
                        # Parse the man page
                        parsed = parser.parse_man_output(result.stdout, cmd)
                        
                        # Insert into database
                        conn.execute("""
                            INSERT OR REPLACE INTO man_pages 
                            (name, section, title, description, synopsis, content, 
                             category, keywords, see_also, examples, options, 
                             is_common, complexity)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            parsed['name'],
                            parsed.get('section', 1),
                            parsed.get('title', ''),
                            parsed.get('description', ''),
                            parsed.get('synopsis', ''),
                            parsed.get('content', ''),
                            parsed.get('category', 'general'),
                            parsed.get('keywords', '[]'),
                            parsed.get('see_also', '[]'),
                            parsed.get('examples', '[]'),
                            parsed.get('options', '[]'),
                            1,  # is_common
                            'basic' if cmd in ['ls', 'cd', 'pwd', 'mkdir', 'rm'] else 'intermediate'
                        ))
                        loaded += 1
                        logger.info(f"Loaded: {cmd}")
                except Exception as e:
                    logger.warning(f"Failed to load {cmd}: {e}")
            
            conn.commit()
        
        logger.info(f"Successfully loaded {loaded} man pages")
        
    except Exception as e:
        logger.error(f"Failed to load initial data: {e}")

def main():
    """Main startup function"""
    logger.info("Starting BetterMan backend...")
    
    # Ensure database exists
    ensure_database_exists()
    
    # Check if we need to load initial data
    with get_db() as conn:
        cursor = conn.execute("SELECT COUNT(*) as count FROM man_pages")
        count = cursor.fetchone()['count']
        
        if count < 10:  # If less than 10 pages, load initial data
            logger.info("Database appears empty, loading initial data...")
            load_initial_data()
        else:
            logger.info(f"Database already contains {count} man pages")
    
    # Start the application
    logger.info("Starting Gunicorn...")
    os.execvp('gunicorn', [
        'gunicorn',
        '-w', '2',
        '-k', 'uvicorn.workers.UvicornWorker',
        '-b', '0.0.0.0:8000',
        '--access-logfile', '-',
        '--error-logfile', '-',
        'src.main_appplatform:app'
    ])

if __name__ == "__main__":
    main()