#!/usr/bin/env python3
"""
Startup script for DigitalOcean App Platform
Handles database initialization and data loading
"""
import os
import sys
import logging
import subprocess
import json
from pathlib import Path

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from database_appplatform import ensure_database_exists, get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def load_initial_data():
    """Load initial man page data"""
    logger.info("Loading initial man page data...")
    
    try:
        # Essential commands to load with basic info
        essential_commands = {
            'ls': ('list directory contents', 'file-management', 'basic'),
            'cd': ('change directory', 'navigation', 'basic'),
            'pwd': ('print working directory', 'navigation', 'basic'),
            'mkdir': ('make directories', 'file-management', 'basic'),
            'rm': ('remove files or directories', 'file-management', 'basic'),
            'cp': ('copy files and directories', 'file-management', 'basic'),
            'mv': ('move/rename files', 'file-management', 'basic'),
            'cat': ('concatenate and print files', 'text-processing', 'basic'),
            'echo': ('display a line of text', 'text-processing', 'basic'),
            'grep': ('search text patterns', 'text-processing', 'intermediate'),
            'find': ('search for files', 'file-management', 'intermediate'),
            'sed': ('stream editor', 'text-processing', 'advanced'),
            'awk': ('pattern scanning', 'text-processing', 'advanced'),
            'chmod': ('change file permissions', 'security', 'intermediate'),
            'curl': ('transfer data from URLs', 'networking', 'intermediate'),
            'git': ('version control system', 'development', 'intermediate'),
            'ssh': ('secure shell client', 'networking', 'intermediate'),
            'tar': ('archive files', 'file-management', 'intermediate'),
            'vim': ('text editor', 'editors', 'advanced'),
            'ps': ('process status', 'system', 'intermediate')
        }
        
        loaded = 0
        with get_db() as conn:
            for cmd, (desc, category, complexity) in essential_commands.items():
                try:
                    # Try to get man page content
                    result = subprocess.run(
                        ['man', cmd],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    
                    content = result.stdout if result.returncode == 0 else f"Documentation for {cmd}"
                    
                    # Basic parsing - extract synopsis
                    synopsis = ''
                    lines = content.split('\n')
                    in_synopsis = False
                    for line in lines:
                        if 'SYNOPSIS' in line:
                            in_synopsis = True
                            continue
                        if in_synopsis and line.strip() and not line.startswith(' '):
                            break
                        if in_synopsis and line.strip():
                            synopsis = line.strip()
                            break
                    
                    # Insert into database
                    conn.execute("""
                        INSERT OR REPLACE INTO man_pages 
                        (name, section, title, description, synopsis, content, 
                         category, keywords, see_also, examples, options, 
                         is_common, complexity)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        cmd,
                        1,
                        desc,
                        desc,
                        synopsis or f"{cmd} [OPTIONS]",
                        content[:5000],  # Limit content size
                        category,
                        json.dumps([cmd, category]),
                        '[]',
                        '[]',
                        '[]',
                        1,  # is_common
                        complexity
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