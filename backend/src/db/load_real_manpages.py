#!/usr/bin/env python3
"""
Script to load real man pages from the system into the database.
"""

import os
import sys
import subprocess
import re
from pathlib import Path

# Add the parent directory to Python path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session
from src.db.session import engine, get_db
from src.models.document import Document, Base
from src.parser.linux_parser import LinuxManParser
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Common commands to load first
PRIORITY_COMMANDS = [
    # System utilities
    "cat", "echo", "pwd", "mkdir", "rmdir", "rm", "cp", "mv", "ln",
    "chmod", "chown", "touch", "find", "which", "whereis", "locate",
    "df", "du", "mount", "umount", "ps", "top", "htop", "kill", "killall",
    "date", "cal", "uptime", "whoami", "id", "uname", "hostname",
    
    # Text processing
    "head", "tail", "less", "more", "sort", "uniq", "cut", "awk", "sed",
    "tr", "wc", "diff", "patch", "comm", "join", "paste",
    
    # File compression
    "tar", "gzip", "gunzip", "zip", "unzip", "bzip2", "bunzip2", 
    
    # Network utilities
    "curl", "wget", "ping", "traceroute", "netstat", "ss", "ip", "ifconfig",
    "ssh", "scp", "rsync", "ftp", "telnet", "nc", "nslookup", "dig", "host",
    
    # Development tools
    "git", "vim", "vi", "nano", "emacs", "make", "gcc", "g++", "python", 
    "python3", "pip", "npm", "node", "docker", "docker-compose",
    
    # System administration
    "systemctl", "service", "journalctl", "crontab", "at", "sudo", "su",
    "useradd", "usermod", "userdel", "groupadd", "passwd", "chpasswd",
    
    # Package management
    "apt", "apt-get", "dpkg", "yum", "dnf", "rpm", "snap", "flatpak",
    
    # File utilities
    "file", "stat", "lsof", "fuser", "tree", "basename", "dirname",
    "realpath", "readlink", "md5sum", "sha256sum", "sha1sum",
]


def load_man_pages():
    """Load real man pages into the database."""
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    # Get database session
    db = next(get_db())
    parser = LinuxManParser()
    
    try:
        # Get existing documents
        existing_names = {doc.name for doc in db.query(Document.name).all()}
        logger.info(f"Found {len(existing_names)} existing documents in database")
        
        loaded_count = 0
        error_count = 0
        
        for cmd in PRIORITY_COMMANDS:
            if cmd in existing_names:
                logger.debug(f"Skipping {cmd} - already exists")
                continue
            
            try:
                # Try to get the man page content
                logger.info(f"Loading man page for: {cmd}")
                
                # Parse the man page
                parsed_data = parser.parse(cmd)
                
                if not parsed_data:
                    logger.warning(f"No content found for {cmd}")
                    error_count += 1
                    continue
                
                # Create document
                document = Document(
                    name=cmd,
                    title=parsed_data.get('title', f'{cmd} - manual page'),
                    section=parsed_data.get('section', 1),
                    summary=parsed_data.get('summary', ''),
                    raw_content=parsed_data.get('raw_content', ''),
                    is_common=True,  # These are all common commands
                    access_count=0,
                    cache_status="permanent",
                    cache_priority=8 if cmd in ["ls", "cd", "grep", "cat", "echo", "pwd"] else 5
                )
                
                db.add(document)
                loaded_count += 1
                
                # Commit every 10 documents
                if loaded_count % 10 == 0:
                    db.commit()
                    logger.info(f"Committed {loaded_count} documents so far...")
                
            except Exception as e:
                logger.error(f"Error loading {cmd}: {e}")
                error_count += 1
                continue
        
        # Final commit
        db.commit()
        
        # Final statistics
        total_docs = db.query(Document).count()
        logger.info(f"\nLoading complete!")
        logger.info(f"Successfully loaded: {loaded_count} new documents")
        logger.info(f"Errors: {error_count}")
        logger.info(f"Total documents in database: {total_docs}")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error loading man pages: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    load_man_pages()