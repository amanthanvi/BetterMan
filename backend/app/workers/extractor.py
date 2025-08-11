"""
Man page extraction pipeline for BetterMan.
Extracts and parses man pages from Ubuntu system into PostgreSQL.
"""

import os
import re
import asyncio
import logging
import subprocess
import hashlib
import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timezone
from tenacity import retry, stop_after_attempt, wait_exponential

import asyncpg
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import insert

# Configure logging
logger = logging.getLogger(__name__)


class ManPageCategory:
    """Categorization for man pages."""
    
    CATEGORIES = {
        'file_operations': {
            'keywords': ['ls', 'cp', 'mv', 'rm', 'mkdir', 'touch', 'chmod', 'chown', 'ln', 'find', 'locate', 'tree', 'stat', 'file', 'readlink'],
            'description': 'File and directory management',
            'icon': '📁',
            'color': '#4A90E2'
        },
        'text_processing': {
            'keywords': ['grep', 'sed', 'awk', 'cut', 'sort', 'uniq', 'tr', 'head', 'tail', 'less', 'more', 'cat', 'echo', 'printf', 'wc', 'diff', 'patch'],
            'description': 'Text manipulation and searching',
            'icon': '📝',
            'color': '#F5A623'
        },
        'process_management': {
            'keywords': ['ps', 'top', 'htop', 'kill', 'killall', 'jobs', 'bg', 'fg', 'nice', 'renice', 'nohup', 'pgrep', 'pkill', 'pidof', 'pstree'],
            'description': 'Process control and monitoring',
            'icon': '⚙️',
            'color': '#7ED321'
        },
        'network': {
            'keywords': ['ssh', 'scp', 'rsync', 'curl', 'wget', 'ping', 'traceroute', 'netstat', 'ss', 'nc', 'telnet', 'ftp', 'nslookup', 'dig', 'host', 'ip', 'ifconfig', 'route'],
            'description': 'Network utilities and communication',
            'icon': '🌐',
            'color': '#BD10E0'
        },
        'development': {
            'keywords': ['git', 'gcc', 'make', 'cmake', 'gdb', 'valgrind', 'strace', 'ltrace', 'nm', 'objdump', 'ldd', 'python', 'node', 'npm', 'docker', 'kubectl'],
            'description': 'Development and debugging tools',
            'icon': '💻',
            'color': '#9013FE'
        },
        'system_administration': {
            'keywords': ['systemctl', 'service', 'journalctl', 'mount', 'umount', 'fdisk', 'parted', 'mkfs', 'fsck', 'useradd', 'usermod', 'passwd', 'su', 'sudo', 'cron', 'crontab', 'at'],
            'description': 'System administration and configuration',
            'icon': '🔧',
            'color': '#D0021B'
        },
        'package_management': {
            'keywords': ['apt', 'dpkg', 'yum', 'rpm', 'snap', 'flatpak', 'pip', 'npm', 'composer', 'cargo', 'gem'],
            'description': 'Package and software management',
            'icon': '📦',
            'color': '#50E3C2'
        },
        'shell': {
            'keywords': ['bash', 'sh', 'zsh', 'fish', 'export', 'alias', 'source', 'eval', 'set', 'unset', 'env', 'which', 'type', 'history', 'fc'],
            'description': 'Shell commands and scripting',
            'icon': '🖥️',
            'color': '#4A4A4A'
        },
        'compression': {
            'keywords': ['tar', 'gzip', 'gunzip', 'zip', 'unzip', 'bzip2', 'bunzip2', 'xz', 'unxz', '7z', 'rar', 'unrar'],
            'description': 'File compression and archiving',
            'icon': '🗜️',
            'color': '#F8E71C'
        }
    }
    
    @classmethod
    def categorize(cls, command_name: str) -> str:
        """
        Categorize a command based on its name.
        
        Args:
            command_name: Name of the command
            
        Returns:
            Category name or 'miscellaneous'
        """
        command_lower = command_name.lower()
        
        for category, info in cls.CATEGORIES.items():
            if command_lower in [k.lower() for k in info['keywords']]:
                return category
        
        # Try prefix matching for common patterns
        if command_lower.startswith('git'):
            return 'development'
        elif command_lower.startswith('docker'):
            return 'development'
        elif command_lower.startswith('kubectl') or command_lower.startswith('k8s'):
            return 'development'
        elif command_lower.startswith('npm') or command_lower.startswith('node'):
            return 'development'
        elif command_lower.startswith('python') or command_lower.startswith('pip'):
            return 'development'
        elif command_lower.startswith('systemd') or command_lower.startswith('systemctl'):
            return 'system_administration'
        
        return 'miscellaneous'
    
    @classmethod
    def get_category_info(cls, category: str) -> Dict[str, Any]:
        """Get information about a category."""
        return cls.CATEGORIES.get(category, {
            'description': 'Other commands',
            'icon': '📄',
            'color': '#B8B8B8'
        })


class ManPageExtractor:
    """Extracts and processes man pages for storage in PostgreSQL."""
    
    # Command categories mapping
    CATEGORIES = {
        'file-management': [
            'ls', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'chmod', 'chown',
            'find', 'locate', 'which', 'whereis', 'file', 'stat', 'du', 'df'
        ],
        'text-processing': [
            'grep', 'sed', 'awk', 'cut', 'sort', 'uniq', 'tr', 'head', 'tail',
            'less', 'more', 'cat', 'tac', 'nl', 'wc', 'split', 'join', 'paste'
        ],
        'process-management': [
            'ps', 'top', 'htop', 'kill', 'killall', 'pkill', 'pgrep', 'jobs',
            'bg', 'fg', 'nohup', 'nice', 'renice', 'pidof', 'pstree'
        ],
        'network': [
            'ping', 'traceroute', 'netstat', 'ss', 'ip', 'ifconfig', 'route',
            'arp', 'dig', 'nslookup', 'host', 'wget', 'curl', 'nc', 'telnet',
            'ssh', 'scp', 'rsync', 'ftp', 'sftp'
        ],
        'system-admin': [
            'systemctl', 'service', 'journalctl', 'hostnamectl', 'timedatectl',
            'useradd', 'usermod', 'userdel', 'groupadd', 'passwd', 'su', 'sudo',
            'mount', 'umount', 'fdisk', 'parted', 'mkfs', 'fsck', 'lsblk'
        ],
        'package-management': [
            'apt', 'apt-get', 'apt-cache', 'dpkg', 'snap', 'flatpak',
            'pip', 'npm', 'cargo', 'gem', 'composer'
        ],
        'development': [
            'git', 'gcc', 'g++', 'make', 'cmake', 'python', 'python3', 'node',
            'npm', 'docker', 'docker-compose', 'kubectl', 'vim', 'emacs', 'nano'
        ],
        'shell': [
            'bash', 'sh', 'zsh', 'fish', 'export', 'alias', 'source', 'eval',
            'set', 'unset', 'env', 'printenv', 'echo', 'printf', 'read', 'test'
        ],
        'archive': [
            'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'bzip2', 'bunzip2',
            'xz', 'unxz', '7z', 'rar', 'unrar'
        ],
        'monitoring': [
            'iostat', 'vmstat', 'sar', 'mpstat', 'uptime', 'free', 'dmesg',
            'lscpu', 'lspci', 'lsusb', 'lsof', 'strace', 'ltrace'
        ]
    }
    
    def __init__(self, db_url: str, redis_url: Optional[str] = None):
        """
        Initialize the extractor.
        
        Args:
            db_url: PostgreSQL connection URL
            redis_url: Redis connection URL (optional)
        """
        self.db_url = self._convert_to_psycopg3_url(db_url)
        self.redis_url = redis_url
        
        # Create SQLAlchemy engine
        self.engine = create_engine(self.db_url, pool_pre_ping=True)
        self.Session = sessionmaker(bind=self.engine)
        
        # Create category lookup
        self.category_lookup = {}
        for category, commands in self.CATEGORIES.items():
            for cmd in commands:
                self.category_lookup[cmd] = category
    
    def _convert_to_psycopg3_url(self, url: str) -> str:
        """Convert database URL to psycopg3 format."""
        if url.startswith('postgresql://') and '+' not in url:
            return url.replace('postgresql://', 'postgresql+psycopg://')
        return url
    
    def _get_category(self, name: str) -> str:
        """Get category for a command."""
        # Use ManPageCategory for categorization
        category = ManPageCategory.categorize(name)
        # Map underscores to hyphens for consistency with database
        return category.replace('_', '-')
    
    def _calculate_hash(self, content: str) -> str:
        """Calculate SHA256 hash of content."""
        return hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    async def discover_man_pages(self) -> List[Tuple[str, int]]:
        """
        Discover all available man pages on the system.
        
        Returns:
            List of (name, section) tuples
        """
        man_pages = []
        
        # Search in standard man page directories
        man_dirs = [
            '/usr/share/man',
            '/usr/local/share/man',
            '/usr/local/man'
        ]
        
        for base_dir in man_dirs:
            if not os.path.exists(base_dir):
                logger.info(f"Directory does not exist: {base_dir}")
                continue
            
            logger.info(f"Searching in {base_dir}")
            
            # Look for man sections (man1, man2, etc.)
            for section_dir in Path(base_dir).glob('man*'):
                if not section_dir.is_dir():
                    continue
                    
                # Extract section number
                section_match = re.match(r'man(\d+)', section_dir.name)
                if not section_match:
                    continue
                    
                section = int(section_match.group(1))
                files_in_section = list(section_dir.glob('*.[0-9]*'))
                if files_in_section:
                    logger.info(f"Found {len(files_in_section)} files in section {section}")
                
                # Find all man pages in this section
                for man_file in section_dir.glob('*.[0-9]*'):
                    # Extract command name (remove .gz and section)
                    name = man_file.stem
                    if name.endswith(f'.{section}'):
                        name = name[:-2]
                    
                    man_pages.append((name, section))
        
        # Remove duplicates and sort
        man_pages = list(set(man_pages))
        man_pages.sort(key=lambda x: (x[0], x[1]))
        
        logger.info(f"Discovered {len(man_pages)} man pages")
        return man_pages
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def parse_man_page(self, name: str, section: int) -> Optional[Dict[str, Any]]:
        """
        Parse a single man page using groff.
        
        Args:
            name: Command name
            section: Man page section
            
        Returns:
            Parsed man page data or None if failed
        """
        try:
            # Get raw man page content
            result = subprocess.run(
                ['man', str(section), name],
                capture_output=True,
                text=True,
                timeout=10,
                env={**os.environ, 'MANWIDTH': '80', 'LANG': 'C'}
            )
            
            if result.returncode != 0:
                return None
            
            content = result.stdout
            if not content:
                return None
            
            # Parse sections
            parsed = {
                'name': name,
                'section': str(section),
                'content': content,
                'content_hash': self._calculate_hash(content),
                'category': self._get_category(name),
                'last_updated': datetime.now(timezone.utc)
            }
            
            # Extract title
            title_match = re.search(r'^NAME\s*\n\s*(.+?)(?:\n|$)', content, re.MULTILINE)
            if title_match:
                parsed['title'] = title_match.group(1).strip()
            
            # Extract synopsis
            synopsis_match = re.search(
                r'^SYNOPSIS\s*\n((?:.*\n)*?)(?:^[A-Z]+\s*$|\Z)',
                content,
                re.MULTILINE
            )
            if synopsis_match:
                parsed['synopsis'] = synopsis_match.group(1).strip()
            
            # Extract description
            desc_match = re.search(
                r'^DESCRIPTION\s*\n((?:.*\n)*?)(?:^[A-Z]+\s*$|\Z)',
                content,
                re.MULTILINE
            )
            if desc_match:
                parsed['description'] = desc_match.group(1).strip()[:5000]  # Limit size
            
            # Extract options (simplified)
            options = []
            options_match = re.search(
                r'^OPTIONS?\s*\n((?:.*\n)*?)(?:^[A-Z]+\s*$|\Z)',
                content,
                re.MULTILINE
            )
            if options_match:
                options_text = options_match.group(1)
                # Simple option extraction (can be enhanced)
                option_lines = re.findall(r'^\s*(-[\w\-]+)[,\s]*(.*)$', options_text, re.MULTILINE)
                for opt, desc in option_lines[:20]:  # Limit to 20 options
                    options.append({'option': opt.strip(), 'description': desc.strip()})
            parsed['options'] = json.dumps(options) if options else '[]'
            
            # Extract examples (simplified)
            examples = []
            examples_match = re.search(
                r'^EXAMPLES?\s*\n((?:.*\n)*?)(?:^[A-Z]+\s*$|\Z)',
                content,
                re.MULTILINE
            )
            if examples_match:
                examples_text = examples_match.group(1)
                # Look for indented code blocks
                example_blocks = re.findall(r'^\s{2,}(.+?)(?:\n\n|\Z)', examples_text, re.MULTILINE | re.DOTALL)
                for block in example_blocks[:5]:  # Limit to 5 examples
                    examples.append({'code': block.strip()})
            parsed['examples'] = json.dumps(examples) if examples else '[]'
            
            # Extract see also
            see_also = []
            see_also_match = re.search(
                r'^SEE ALSO\s*\n((?:.*\n)*?)(?:^[A-Z]+\s*$|\Z)',
                content,
                re.MULTILINE
            )
            if see_also_match:
                see_also_text = see_also_match.group(1)
                # Extract command references (word followed by section in parentheses)
                refs = re.findall(r'(\w+)\s*\((\d+)\)', see_also_text)
                see_also = [f"{cmd}({sec})" for cmd, sec in refs[:10]]  # Limit to 10
            parsed['see_also'] = json.dumps(see_also) if see_also else '[]'
            
            # Extract author
            author_match = re.search(
                r'^AUTHOR\s*\n((?:.*\n)*?)(?:^[A-Z]+\s*$|\Z)',
                content,
                re.MULTILINE
            )
            if author_match:
                parsed['author'] = author_match.group(1).strip()[:500]
            
            return parsed
            
        except subprocess.TimeoutExpired:
            logger.warning(f"Timeout parsing {name}({section})")
            return None
        except Exception as e:
            logger.error(f"Error parsing {name}({section}): {e}")
            return None
    
    def store_to_database(self, man_pages: List[Dict[str, Any]]) -> int:
        """
        Store man pages to PostgreSQL database.
        
        Args:
            man_pages: List of parsed man page data
            
        Returns:
            Number of pages stored
        """
        if not man_pages:
            return 0
        
        stored = 0
        
        with self.Session() as session:
            try:
                for page in man_pages:
                    try:
                        # Prepare the data matching the actual schema
                        # The content field in the schema is JSONB, so we need to structure it properly
                        # Safely parse JSON fields - they should already be JSON strings
                        options_data = page.get('options')
                        examples_data = page.get('examples')
                        see_also_data = page.get('see_also')
                        
                        content_json = {
                            'raw': page['content'],
                            'synopsis': page.get('synopsis'),
                            'options': json.loads(options_data) if options_data else [],
                            'examples': json.loads(examples_data) if examples_data else [],
                            'see_also': json.loads(see_also_data) if see_also_data else [],
                            'author': page.get('author')
                        }
                        
                        # Prepare meta_data JSONB field
                        meta_data = {
                            'parsed_at': datetime.now(timezone.utc).isoformat(),
                            'content_hash': page['content_hash']
                        }
                        
                        # Truncate fields to fit database column limits
                        title = page.get('title', '')
                        if title and len(title) > 255:
                            title = title[:252] + '...'
                        
                        description = page.get('description', '')
                        if description and len(description) > 5000:
                            description = description[:4997] + '...'
                        
                        data = {
                            'id': str(uuid.uuid4()),
                            'name': page['name'][:255] if page['name'] else '',
                            'section': page['section'][:10] if page['section'] else '',
                            'title': title,
                            'description': description,
                            'synopsis': page.get('synopsis'),
                            'content': json.dumps(content_json),
                            'category': page['category'],
                            'meta_data': json.dumps(meta_data),
                            'is_common': page['name'] in ['ls', 'cd', 'grep', 'find', 'cat', 'echo', 'rm', 'cp', 'mv', 'mkdir']
                        }
                        
                        # Use INSERT ... ON CONFLICT UPDATE with proper casting
                        stmt = text("""
                            INSERT INTO man_pages (
                                id, name, section, title, description, synopsis,
                                content, category, meta_data, is_common,
                                created_at, updated_at
                            ) VALUES (
                                CAST(:id AS uuid), :name, :section, :title, :description, :synopsis,
                                CAST(:content AS jsonb), :category, CAST(:meta_data AS jsonb), :is_common,
                                NOW(), NOW()
                            )
                            ON CONFLICT (name, section) 
                            DO UPDATE SET
                                title = EXCLUDED.title,
                                description = EXCLUDED.description,
                                synopsis = EXCLUDED.synopsis,
                                content = EXCLUDED.content,
                                category = EXCLUDED.category,
                                meta_data = EXCLUDED.meta_data,
                                is_common = EXCLUDED.is_common,
                                updated_at = NOW()
                        """)
                        
                        result = session.execute(stmt, data)
                        if result.rowcount > 0:
                            stored += 1
                            
                    except Exception as e:
                        logger.warning(f"Failed to store {page.get('name', 'unknown')}({page.get('section', '?')}): {e}")
                        continue
                
                session.commit()
                
            except Exception as e:
                logger.error(f"Database error: {e}")
                session.rollback()
                raise
        
        logger.info(f"Stored {stored} man pages to database")
        return stored
    
    def update_search_vectors(self):
        """Update PostgreSQL full-text search vectors."""
        with self.Session() as session:
            try:
                # Update search vectors for all pages
                # Using updated_at column which exists in the schema
                session.execute(text("""
                    UPDATE man_pages 
                    SET search_vector = to_tsvector('english',
                        coalesce(name, '') || ' ' ||
                        coalesce(title, '') || ' ' ||
                        coalesce(description, '') || ' ' ||
                        coalesce(synopsis, '')
                    )
                    WHERE search_vector IS NULL 
                       OR updated_at > COALESCE(
                           (SELECT MAX(updated_at) FROM man_pages WHERE search_vector IS NOT NULL),
                           '1900-01-01'::timestamp
                       )
                """))
                
                session.commit()
                logger.info("Search vectors updated")
                
            except Exception as e:
                logger.error(f"Error updating search vectors: {e}")
                session.rollback()
    
    async def run_extraction(self, incremental: bool = True) -> Dict[str, Any]:
        """
        Run the extraction pipeline.
        
        Args:
            incremental: If True, only process new/changed pages
            
        Returns:
            Extraction statistics
        """
        logger.info(f"Starting man page extraction (incremental={incremental})")
        start_time = datetime.now()
        
        stats = {
            'total': 0,
            'success': 0,
            'failed': 0,
            'skipped': 0,
            'categories': {}
        }
        
        try:
            # Discover available man pages
            man_pages = await self.discover_man_pages()
            stats['total'] = len(man_pages)
            
            # Get existing pages if incremental
            existing_pages = set()
            if incremental:
                with self.Session() as session:
                    # Only check for existing pages by name and section
                    # since content_hash doesn't exist in the schema
                    result = session.execute(text(
                        "SELECT name, section FROM man_pages"
                    ))
                    for row in result:
                        existing_pages.add((row.name, str(row.section)))
            
            # Process in batches
            batch_size = 50
            parsed_pages = []
            
            for i in range(0, len(man_pages), batch_size):
                batch = man_pages[i:i + batch_size]
                logger.info(f"Processing batch {i//batch_size + 1}/{(len(man_pages) + batch_size - 1)//batch_size}")
                
                for name, section in batch:
                    # Skip if already exists (incremental mode)
                    if incremental:
                        key = (name, str(section))
                        if key in existing_pages:
                            stats['skipped'] += 1
                            continue
                    
                    # Parse the man page
                    parsed = self.parse_man_page(name, section)
                    
                    if parsed:
                        parsed_pages.append(parsed)
                        stats['success'] += 1
                        
                        # Track categories
                        category = parsed['category']
                        stats['categories'][category] = stats['categories'].get(category, 0) + 1
                    else:
                        stats['failed'] += 1
                
                # Store batch to database
                if parsed_pages:
                    self.store_to_database(parsed_pages)
                    parsed_pages = []
            
            # Store any remaining pages
            if parsed_pages:
                self.store_to_database(parsed_pages)
            
            # Update search vectors
            logger.info("Updating search vectors...")
            self.update_search_vectors()
            
            # Save extraction metadata
            self._save_metadata(stats)
            
        except Exception as e:
            logger.error(f"Extraction failed: {e}", exc_info=True)
            raise
        
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"Extraction completed in {elapsed:.2f} seconds")
        logger.info(f"Statistics: {json.dumps(stats, indent=2)}")
        
        return stats
    
    def _save_metadata(self, stats: Dict[str, Any]):
        """Save extraction metadata to database."""
        try:
            with self.Session() as session:
                metadata = {
                    'extraction_time': datetime.now(timezone.utc).isoformat(),
                    'statistics': stats
                }
                
                # Check if cache_metadata table exists, if not skip saving
                try:
                    session.execute(text("""
                        INSERT INTO cache_metadata (cache_key, cache_value, created_at)
                        VALUES ('extraction_metadata', :metadata::jsonb, NOW())
                        ON CONFLICT (cache_key) DO UPDATE 
                        SET cache_value = EXCLUDED.cache_value,
                            created_at = NOW()
                    """), {'metadata': json.dumps(metadata)})
                    
                    session.commit()
                except Exception:
                    # Table might not exist, log extraction stats instead
                    logger.info(f"Extraction metadata: {json.dumps(metadata, indent=2)}")
                
        except Exception as e:
            logger.warning(f"Failed to save metadata: {e}")