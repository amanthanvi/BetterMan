#!/usr/bin/env python3
"""
Quick script to load common real man pages from the system into the database.
This is a simpler version that loads the most commonly used commands.
"""

import os
import sys
import subprocess
import gzip
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List

# Add the parent directory to Python path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session
from src.db.session import engine, get_db, SessionLocal
from src.models.document import Document, Base
from src.parser.man_loader import ManPageLoader
from src.parser.enhanced_groff_parser import EnhancedGroffParser

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Extended list of common commands by category
COMMANDS_BY_CATEGORY = {
    "essential": [
        "ls", "cd", "pwd", "mkdir", "rmdir", "rm", "cp", "mv", "ln",
        "cat", "echo", "touch", "chmod", "chown", "chgrp", "umask"
    ],
    "text_processing": [
        "grep", "sed", "awk", "cut", "sort", "uniq", "wc", "tr",
        "head", "tail", "less", "more", "tee", "nl", "fmt", "fold",
        "join", "paste", "comm", "diff", "patch", "cmp"
    ],
    "file_operations": [
        "find", "locate", "which", "whereis", "file", "stat", "du", "df",
        "tar", "gzip", "gunzip", "zip", "unzip", "bzip2", "bunzip2",
        "xz", "unxz", "rsync", "scp", "sftp"
    ],
    "system_info": [
        "ps", "top", "htop", "free", "vmstat", "iostat", "mpstat",
        "uptime", "w", "who", "whoami", "id", "groups", "hostname",
        "uname", "lsb_release", "date", "cal", "timedatectl"
    ],
    "network": [
        "ping", "traceroute", "netstat", "ss", "ip", "ifconfig",
        "route", "arp", "dig", "nslookup", "host", "wget", "curl",
        "nc", "telnet", "ssh", "ssh-keygen", "ssh-copy-id"
    ],
    "process_management": [
        "kill", "killall", "pkill", "pgrep", "jobs", "fg", "bg",
        "nohup", "nice", "renice", "at", "batch", "cron", "crontab"
    ],
    "package_management": [
        "apt", "apt-get", "apt-cache", "dpkg", "snap", "flatpak",
        "yum", "dnf", "rpm", "zypper", "pacman", "emerge"
    ],
    "development": [
        "git", "make", "gcc", "g++", "clang", "python", "python3",
        "pip", "pip3", "node", "npm", "yarn", "cargo", "go",
        "javac", "java", "mvn", "gradle", "docker", "docker-compose"
    ],
    "editors": [
        "vim", "vi", "nano", "emacs", "ed", "sed", "awk"
    ],
    "shell": [
        "bash", "sh", "zsh", "fish", "dash", "source", "export",
        "alias", "unalias", "history", "fc", "type", "command"
    ],
    "administration": [
        "sudo", "su", "passwd", "useradd", "usermod", "userdel",
        "groupadd", "groupmod", "groupdel", "chsh", "systemctl",
        "service", "journalctl", "dmesg", "lsmod", "modprobe"
    ]
}


class QuickManPageLoader:
    """Quick loader for common man pages."""
    
    def __init__(self):
        self.loader = ManPageLoader()
        self.parser = EnhancedGroffParser()
        self.stats = {
            'total': 0,
            'loaded': 0,
            'skipped': 0,
            'failed': 0,
            'errors': []
        }
        
    def load_common_manpages(self, categories: Optional[List[str]] = None):
        """
        Load common man pages by category.
        
        Args:
            categories: Optional list of categories to load. If None, loads all.
        """
        logger.info("Starting quick man page loading...")
        
        # Initialize database
        Base.metadata.create_all(bind=engine)
        
        # Get database session
        db = SessionLocal()
        
        try:
            # Get existing documents
            existing_names = {doc.name for doc in db.query(Document.name).all()}
            logger.info(f"Found {len(existing_names)} existing documents")
            
            # Determine which categories to load
            if categories:
                selected_categories = {cat: cmds for cat, cmds in COMMANDS_BY_CATEGORY.items() 
                                     if cat in categories}
            else:
                selected_categories = COMMANDS_BY_CATEGORY
                
            # Process each category
            for category, commands in selected_categories.items():
                logger.info(f"\nLoading {category} commands ({len(commands)} total)...")
                self._load_category(db, category, commands, existing_names)
                
            # Final commit
            db.commit()
            
            # Display final statistics
            self._display_stats()
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error during loading: {e}")
            raise
        finally:
            db.close()
            
    def _load_category(self, db: Session, category: str, commands: List[str], 
                      existing_names: set):
        """Load commands from a specific category."""
        category_stats = {'loaded': 0, 'skipped': 0, 'failed': 0}
        
        for cmd in commands:
            self.stats['total'] += 1
            
            if cmd in existing_names:
                logger.debug(f"  Skipping {cmd} - already exists")
                self.stats['skipped'] += 1
                category_stats['skipped'] += 1
                continue
                
            try:
                # Load the man page
                content, error = self.loader.load_man_page(cmd)
                
                if error or not content:
                    logger.warning(f"  Failed to load {cmd}: {error or 'No content'}")
                    self.stats['failed'] += 1
                    category_stats['failed'] += 1
                    if error:
                        self.stats['errors'].append(f"{cmd}: {error}")
                    continue
                    
                # Get raw groff content if available
                raw_groff = self.loader.get_raw_groff(cmd)
                
                # Parse the content
                if raw_groff:
                    # Parse groff format
                    parsed_data = self.parser.parse(raw_groff)
                else:
                    # Parse formatted output
                    parsed_data = self._parse_formatted_output(content, cmd)
                    
                # Create document
                document = Document(
                    name=cmd,
                    title=parsed_data.get('title', f'{cmd} - manual page'),
                    section=parsed_data.get('section', 1),
                    summary=parsed_data.get('description', '')[:500],  # First 500 chars
                    content=json.dumps(parsed_data),
                    raw_content=raw_groff or content,
                    category=category,
                    tags=f"{category},priority-{self._get_priority(category)}",
                    is_common=True,
                    access_count=0,
                    cache_status="permanent",
                    cache_priority=self._get_priority(category)
                )
                
                db.add(document)
                self.stats['loaded'] += 1
                category_stats['loaded'] += 1
                
                # Commit every 20 documents
                if self.stats['loaded'] % 20 == 0:
                    db.commit()
                    logger.info(f"  Progress: {self.stats['loaded']} loaded...")
                    
            except Exception as e:
                logger.error(f"  Error loading {cmd}: {e}")
                self.stats['failed'] += 1
                category_stats['failed'] += 1
                self.stats['errors'].append(f"{cmd}: {str(e)}")
                
        logger.info(f"  {category} complete: {category_stats['loaded']} loaded, "
                   f"{category_stats['skipped']} skipped, {category_stats['failed']} failed")
                
    def _parse_formatted_output(self, content: str, command: str) -> Dict:
        """Parse formatted man page output."""
        sections = {}
        current_section = None
        section_content = []
        
        for line in content.split('\n'):
            # Detect section headers (all caps at start of line)
            if line and line[0].isupper() and line.isupper():
                if current_section:
                    sections[current_section] = '\n'.join(section_content).strip()
                current_section = line.strip()
                section_content = []
            else:
                section_content.append(line)
                
        # Add last section
        if current_section:
            sections[current_section] = '\n'.join(section_content).strip()
            
        # Extract title and description
        title = command
        description = ""
        
        if 'NAME' in sections:
            name_parts = sections['NAME'].split(' - ', 1)
            if len(name_parts) == 2:
                title = name_parts[0].strip()
                description = name_parts[1].strip()
                
        return {
            'title': title,
            'command': command,
            'section': 1,  # Default to section 1
            'description': description,
            'sections': sections,
            'parsed_at': datetime.now().isoformat()
        }
        
    def _get_priority(self, category: str) -> int:
        """Get cache priority based on category."""
        priority_map = {
            "essential": 9,
            "text_processing": 8,
            "file_operations": 8,
            "system_info": 7,
            "network": 7,
            "process_management": 6,
            "shell": 6,
            "development": 5,
            "editors": 5,
            "package_management": 4,
            "administration": 4
        }
        return priority_map.get(category, 3)
        
    def _display_stats(self):
        """Display loading statistics."""
        logger.info("\n" + "=" * 60)
        logger.info("LOADING COMPLETE")
        logger.info("=" * 60)
        logger.info(f"Total commands processed: {self.stats['total']}")
        logger.info(f"Successfully loaded: {self.stats['loaded']}")
        logger.info(f"Skipped (already exist): {self.stats['skipped']}")
        logger.info(f"Failed to load: {self.stats['failed']}")
        
        if self.stats['errors']:
            logger.info(f"\nFirst 10 errors:")
            for error in self.stats['errors'][:10]:
                logger.info(f"  - {error}")
                
        # Database statistics
        db = SessionLocal()
        try:
            total_docs = db.query(Document).count()
            logger.info(f"\nTotal documents in database: {total_docs}")
        finally:
            db.close()


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Quickly load common man pages into the database"
    )
    parser.add_argument(
        '--categories',
        nargs='+',
        choices=list(COMMANDS_BY_CATEGORY.keys()),
        help='Specific categories to load'
    )
    
    args = parser.parse_args()
    
    # Create the loader
    loader = QuickManPageLoader()
    
    # Load the man pages
    loader.load_common_manpages(categories=args.categories)


if __name__ == "__main__":
    main()