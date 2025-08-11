"""
Man page extraction pipeline for Railway deployment.
Extracts man pages from Ubuntu 24.04 container and stores in PostgreSQL.
"""

import os
import re
import json
import hashlib
import subprocess
import logging
import tempfile
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4
import asyncio
import asyncpg
from sqlalchemy import create_engine, text, select, and_
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.dialects.postgresql import UUID, TSVECTOR, JSONB
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logging.basicConfig(level=logging.INFO)
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
            'keywords': ['cat', 'grep', 'sed', 'awk', 'sort', 'uniq', 'cut', 'paste', 'tr', 'head', 'tail', 'less', 'more', 'vi', 'vim', 'emacs', 'nano', 'ed'],
            'description': 'Text manipulation and editing',
            'icon': '📝',
            'color': '#7B68EE'
        },
        'network': {
            'keywords': ['ping', 'curl', 'wget', 'ssh', 'scp', 'rsync', 'netstat', 'ss', 'ip', 'ifconfig', 'route', 'dig', 'nslookup', 'host', 'traceroute', 'nc', 'netcat', 'telnet', 'ftp'],
            'description': 'Network utilities and protocols',
            'icon': '🌐',
            'color': '#2ECC71'
        },
        'process_management': {
            'keywords': ['ps', 'top', 'htop', 'kill', 'killall', 'jobs', 'bg', 'fg', 'nohup', 'nice', 'renice', 'pgrep', 'pkill', 'systemctl', 'service', 'journalctl'],
            'description': 'Process control and monitoring',
            'icon': '⚙️',
            'color': '#E74C3C'
        },
        'system_info': {
            'keywords': ['uname', 'hostname', 'date', 'uptime', 'who', 'whoami', 'id', 'df', 'du', 'free', 'lscpu', 'lsblk', 'lspci', 'lsusb', 'dmidecode', 'mount', 'umount'],
            'description': 'System information and monitoring',
            'icon': '💻',
            'color': '#F39C12'
        },
        'development': {
            'keywords': ['git', 'gcc', 'g++', 'make', 'cmake', 'docker', 'kubectl', 'npm', 'node', 'python', 'pip', 'ruby', 'gem', 'cargo', 'rustc', 'go', 'javac', 'mvn', 'gradle'],
            'description': 'Development tools and compilers',
            'icon': '👨‍💻',
            'color': '#9B59B6'
        },
        'archive': {
            'keywords': ['tar', 'gzip', 'gunzip', 'zip', 'unzip', 'bzip2', 'bunzip2', 'xz', 'rar', 'unrar', '7z', 'ar', 'cpio'],
            'description': 'Archive and compression utilities',
            'icon': '📦',
            'color': '#34495E'
        },
        'user_management': {
            'keywords': ['useradd', 'userdel', 'usermod', 'groupadd', 'groupdel', 'groupmod', 'passwd', 'chpasswd', 'su', 'sudo', 'visudo', 'groups', 'newgrp', 'chsh'],
            'description': 'User and group management',
            'icon': '👥',
            'color': '#16A085'
        },
        'package_management': {
            'keywords': ['apt', 'apt-get', 'apt-cache', 'dpkg', 'snap', 'flatpak', 'yum', 'dnf', 'rpm', 'pacman', 'zypper', 'brew'],
            'description': 'Package management tools',
            'icon': '📦',
            'color': '#D35400'
        },
        'shell': {
            'keywords': ['bash', 'sh', 'zsh', 'fish', 'dash', 'ksh', 'tcsh', 'csh', 'export', 'alias', 'source', 'echo', 'printf', 'read', 'test', 'expr', 'eval'],
            'description': 'Shell and scripting',
            'icon': '🖥️',
            'color': '#27AE60'
        }
    }
    
    @classmethod
    def categorize(cls, name: str, description: str = '') -> Tuple[str, Dict[str, Any]]:
        """Categorize a command based on its name and description."""
        name_lower = name.lower()
        desc_lower = description.lower() if description else ''
        
        for category, info in cls.CATEGORIES.items():
            for keyword in info['keywords']:
                if keyword in name_lower or keyword in desc_lower:
                    return category, info
        
        return 'general', {
            'description': 'General utilities',
            'icon': '🔧',
            'color': '#95A5A6'
        }


class ManPageExtractor:
    """Extract and parse man pages from Ubuntu system."""
    
    def __init__(self, db_url: str, redis_url: Optional[str] = None):
        self.db_url = db_url
        self.redis_url = redis_url
        self.engine = create_engine(db_url, pool_size=20, max_overflow=40)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.extraction_stats = {
            'total': 0,
            'success': 0,
            'failed': 0,
            'skipped': 0,
            'categories': {}
        }
        
    def get_installed_packages(self) -> List[str]:
        """Get list of packages to extract man pages from."""
        packages = [
            # Core man pages
            'man-db', 'manpages', 'manpages-dev', 'manpages-posix', 'manpages-posix-dev',
            # Core utilities
            'coreutils', 'util-linux', 'procps', 'psmisc',
            # Network tools
            'net-tools', 'iproute2', 'iputils-ping', 'dnsutils', 'curl', 'wget',
            # Development tools
            'build-essential', 'git', 'make', 'cmake', 'gcc', 'g++',
            # Container tools (if available)
            'docker.io', 'kubectl',
            # System tools
            'systemd', 'udev', 'lsb-release',
            # Archive tools
            'tar', 'gzip', 'bzip2', 'xz-utils', 'zip', 'unzip',
            # Text processing
            'grep', 'sed', 'gawk', 'diffutils', 'patch',
            # Shell
            'bash', 'dash',
            # Package management
            'apt', 'dpkg', 'apt-utils'
        ]
        return packages
    
    def install_packages(self):
        """Install required packages in container."""
        packages = self.get_installed_packages()
        logger.info(f"Installing {len(packages)} packages...")
        
        try:
            # Update package list
            subprocess.run(['apt-get', 'update'], check=True, capture_output=True)
            
            # Install packages
            cmd = ['apt-get', 'install', '-y', '--no-install-recommends'] + packages
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.warning(f"Some packages failed to install: {result.stderr}")
            else:
                logger.info("Package installation completed")
                
        except Exception as e:
            logger.error(f"Failed to install packages: {e}")
            raise
    
    def discover_man_pages(self) -> List[Tuple[str, str, str]]:
        """Discover all available man pages on the system."""
        man_pages = []
        
        # Standard man page directories
        man_dirs = [
            '/usr/share/man',
            '/usr/local/share/man',
            '/usr/man',
            '/usr/local/man'
        ]
        
        for man_dir in man_dirs:
            if not os.path.exists(man_dir):
                continue
                
            for section_dir in Path(man_dir).iterdir():
                if not section_dir.is_dir():
                    continue
                    
                # Extract section number (e.g., man1, man3, man3pm)
                section_match = re.match(r'man(\d+\w*)', section_dir.name)
                if not section_match:
                    continue
                    
                section = section_match.group(1)
                
                for man_file in section_dir.iterdir():
                    if man_file.is_file():
                        # Remove .gz or other compression extensions
                        name = man_file.stem
                        if name.endswith('.gz'):
                            name = name[:-3]
                        
                        # Remove section from name if present (e.g., ls.1 -> ls)
                        name = re.sub(r'\.\d+\w*$', '', name)
                        
                        man_pages.append((name, section, str(man_file)))
                        
        logger.info(f"Discovered {len(man_pages)} man pages")
        return man_pages
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(subprocess.TimeoutExpired)
    )
    def parse_man_page(self, name: str, section: str, file_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Parse a man page using groff and extract structured data."""
        try:
            # Use man command to get the formatted output
            cmd = ['man', f'{section}', name] if not file_path else ['man', file_path]
            
            # Get raw troff source
            raw_cmd = ['man', '-P', 'cat', f'{section}', name] if not file_path else ['zcat', file_path] if file_path.endswith('.gz') else ['cat', file_path]
            
            # Execute commands with timeout
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10,
                env={**os.environ, 'MANWIDTH': '80', 'COLUMNS': '80'}
            )
            
            if result.returncode != 0:
                logger.warning(f"Failed to parse {name}({section}): {result.stderr}")
                return None
            
            content = result.stdout
            
            # Get raw source for more detailed parsing
            raw_result = subprocess.run(raw_cmd, capture_output=True, text=True, timeout=5)
            raw_content = raw_result.stdout if raw_result.returncode == 0 else ''
            
            # Parse sections
            parsed = self.extract_sections(content, raw_content)
            
            # Get category
            category, category_info = ManPageCategory.categorize(name, parsed.get('description', ''))
            
            # Generate unique ID
            page_id = str(uuid4())
            
            # Calculate content hash for change detection
            content_hash = hashlib.sha256(content.encode()).hexdigest()
            
            return {
                'id': page_id,
                'name': name,
                'section': section,
                'title': parsed.get('title', f'{name}({section})'),
                'description': parsed.get('description', ''),
                'synopsis': parsed.get('synopsis', ''),
                'content': {
                    'sections': parsed.get('sections', []),
                    'options': parsed.get('options', []),
                    'examples': parsed.get('examples', []),
                    'see_also': parsed.get('see_also', []),
                    'raw': content[:50000] if len(content) > 50000 else content  # Limit size
                },
                'category': category,
                'category_info': category_info,
                'related_commands': parsed.get('see_also', []),
                'meta_data': {
                    'file_path': file_path,
                    'file_size': os.path.getsize(file_path) if file_path and os.path.exists(file_path) else None,
                    'content_hash': content_hash,
                    'extracted_at': datetime.utcnow().isoformat(),
                    'extractor_version': '1.0.0'
                },
                'is_common': self.is_common_command(name),
                'view_count': 0,
                'cache_priority': 1 if self.is_common_command(name) else 0
            }
            
        except subprocess.TimeoutExpired:
            logger.error(f"Timeout parsing {name}({section})")
            raise
        except Exception as e:
            logger.error(f"Error parsing {name}({section}): {e}")
            return None
    
    def extract_sections(self, content: str, raw_content: str = '') -> Dict[str, Any]:
        """Extract structured sections from man page content."""
        sections = []
        current_section = None
        current_content = []
        
        # Common section headers
        section_patterns = [
            r'^[A-Z][A-Z\s]+$',  # ALL CAPS
            r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$',  # Title Case
        ]
        
        lines = content.split('\n')
        
        # Extract title and description from header
        title = ''
        description = ''
        synopsis = ''
        options = []
        examples = []
        see_also = []
        
        for i, line in enumerate(lines):
            line = line.strip()
            
            # Skip empty lines
            if not line:
                if current_section:
                    current_content.append('')
                continue
            
            # Check if this is a section header
            is_section = False
            for pattern in section_patterns:
                if re.match(pattern, line):
                    # Common section names
                    if line.upper() in ['NAME', 'SYNOPSIS', 'DESCRIPTION', 'OPTIONS', 'EXAMPLES', 
                                        'SEE ALSO', 'AUTHOR', 'AUTHORS', 'BUGS', 'COPYRIGHT', 
                                        'HISTORY', 'FILES', 'ENVIRONMENT', 'NOTES', 'CAVEATS',
                                        'DIAGNOSTICS', 'EXIT STATUS', 'RETURN VALUE']:
                        is_section = True
                        break
            
            if is_section:
                # Save previous section
                if current_section:
                    section_content = '\n'.join(current_content).strip()
                    
                    # Special handling for specific sections
                    if current_section == 'NAME':
                        # Extract name and short description
                        match = re.match(r'^(\S+)\s*-\s*(.+)$', section_content, re.MULTILINE)
                        if match:
                            title = match.group(1)
                            description = match.group(2)
                    elif current_section == 'SYNOPSIS':
                        synopsis = section_content
                    elif current_section == 'OPTIONS':
                        options = self.parse_options(section_content)
                    elif current_section == 'EXAMPLES':
                        examples = self.parse_examples(section_content)
                    elif current_section == 'SEE ALSO':
                        see_also = self.parse_see_also(section_content)
                    
                    sections.append({
                        'name': current_section,
                        'content': section_content
                    })
                
                current_section = line.upper()
                current_content = []
            else:
                current_content.append(line)
        
        # Don't forget the last section
        if current_section:
            section_content = '\n'.join(current_content).strip()
            
            if current_section == 'NAME':
                match = re.match(r'^(\S+)\s*-\s*(.+)$', section_content, re.MULTILINE)
                if match:
                    title = match.group(1)
                    description = match.group(2)
            elif current_section == 'SYNOPSIS':
                synopsis = section_content
            elif current_section == 'OPTIONS':
                options = self.parse_options(section_content)
            elif current_section == 'EXAMPLES':
                examples = self.parse_examples(section_content)
            elif current_section == 'SEE ALSO':
                see_also = self.parse_see_also(section_content)
            
            sections.append({
                'name': current_section,
                'content': section_content
            })
        
        return {
            'title': title,
            'description': description,
            'synopsis': synopsis,
            'sections': sections,
            'options': options,
            'examples': examples,
            'see_also': see_also
        }
    
    def parse_options(self, content: str) -> List[Dict[str, str]]:
        """Parse OPTIONS section into structured format."""
        options = []
        current_option = None
        current_desc = []
        
        for line in content.split('\n'):
            # Check if line starts with an option (e.g., -a, --all)
            option_match = re.match(r'^\s*(-\w|--\w[\w-]*)', line)
            
            if option_match:
                # Save previous option
                if current_option:
                    options.append({
                        'flag': current_option,
                        'description': ' '.join(current_desc).strip()
                    })
                
                current_option = option_match.group(1)
                # Get description from the rest of the line
                rest = line[option_match.end():].strip()
                current_desc = [rest] if rest else []
            elif current_option and line.strip():
                # Continuation of description
                current_desc.append(line.strip())
        
        # Don't forget the last option
        if current_option:
            options.append({
                'flag': current_option,
                'description': ' '.join(current_desc).strip()
            })
        
        return options
    
    def parse_examples(self, content: str) -> List[Dict[str, str]]:
        """Parse EXAMPLES section into structured format."""
        examples = []
        current_example = None
        current_desc = []
        
        for line in content.split('\n'):
            # Check if line looks like a command (starts with $ or #, or just looks like a command)
            if re.match(r'^\s*[$#]\s*\S+', line) or re.match(r'^\s*\w+\s+', line):
                # Save previous example
                if current_example:
                    examples.append({
                        'command': current_example,
                        'description': ' '.join(current_desc).strip()
                    })
                
                current_example = line.strip().lstrip('$#').strip()
                current_desc = []
            elif current_example and line.strip():
                # Description of the example
                current_desc.append(line.strip())
        
        # Don't forget the last example
        if current_example:
            examples.append({
                'command': current_example,
                'description': ' '.join(current_desc).strip()
            })
        
        return examples
    
    def parse_see_also(self, content: str) -> List[str]:
        """Parse SEE ALSO section into list of related commands."""
        related = []
        
        # Extract command references (e.g., ls(1), grep(1))
        matches = re.findall(r'(\w+)\(\d+\w*\)', content)
        related.extend(matches)
        
        # Also look for comma-separated commands without section numbers
        if not related:
            # Split by comma and clean up
            parts = content.split(',')
            for part in parts:
                cmd = part.strip().split('(')[0].strip()
                if cmd and re.match(r'^\w+$', cmd):
                    related.append(cmd)
        
        return list(set(related))  # Remove duplicates
    
    def is_common_command(self, name: str) -> bool:
        """Check if a command is commonly used."""
        common_commands = {
            'ls', 'cd', 'pwd', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch',
            'cat', 'less', 'more', 'head', 'tail', 'grep', 'sed', 'awk',
            'find', 'locate', 'which', 'whereis', 'man', 'info',
            'ps', 'top', 'kill', 'killall', 'jobs', 'bg', 'fg',
            'chmod', 'chown', 'chgrp', 'umask',
            'tar', 'gzip', 'gunzip', 'zip', 'unzip',
            'ssh', 'scp', 'rsync', 'curl', 'wget',
            'git', 'make', 'gcc', 'python', 'node', 'npm',
            'sudo', 'su', 'passwd', 'useradd', 'groupadd',
            'apt', 'apt-get', 'dpkg', 'systemctl', 'service',
            'df', 'du', 'free', 'uname', 'hostname', 'date', 'uptime'
        }
        return name.lower() in common_commands
    
    def generate_search_vector(self, data: Dict[str, Any]) -> str:
        """Generate PostgreSQL full-text search vector."""
        # Combine text for search vector
        search_text = ' '.join([
            data.get('name', '') * 3,  # Name is most important
            data.get('title', '') * 2,  # Title is important
            data.get('description', ''),
            data.get('synopsis', ''),
            ' '.join([opt.get('flag', '') for opt in data.get('content', {}).get('options', [])]),
            ' '.join([ex.get('command', '') for ex in data.get('content', {}).get('examples', [])])
        ])
        
        return search_text
    
    async def store_to_database(self, pages: List[Dict[str, Any]]):
        """Store extracted man pages to PostgreSQL database."""
        session = self.SessionLocal()
        stored_count = 0
        
        try:
            for page_data in pages:
                try:
                    # Check if page already exists
                    existing = session.execute(
                        text("SELECT id, meta_data FROM man_pages WHERE name = :name AND section = :section"),
                        {"name": page_data['name'], "section": page_data['section']}
                    ).first()
                    
                    # Check if content has changed
                    if existing:
                        existing_hash = existing.meta_data.get('content_hash') if existing.meta_data else None
                        new_hash = page_data['meta_data']['content_hash']
                        
                        if existing_hash == new_hash:
                            logger.debug(f"Skipping unchanged page: {page_data['name']}({page_data['section']})")
                            self.extraction_stats['skipped'] += 1
                            continue
                        
                        # Update existing page
                        session.execute(
                            text("""
                                UPDATE man_pages 
                                SET title = :title,
                                    description = :description,
                                    synopsis = :synopsis,
                                    content = :content::jsonb,
                                    category = :category,
                                    related_commands = :related_commands,
                                    meta_data = :meta_data::jsonb,
                                    is_common = :is_common,
                                    updated_at = NOW()
                                WHERE name = :name AND section = :section
                            """),
                            {
                                "name": page_data['name'],
                                "section": page_data['section'],
                                "title": page_data['title'],
                                "description": page_data['description'],
                                "synopsis": page_data['synopsis'],
                                "content": json.dumps(page_data['content']),
                                "category": page_data['category'],
                                "related_commands": page_data['related_commands'],
                                "meta_data": json.dumps(page_data['meta_data']),
                                "is_common": page_data['is_common']
                            }
                        )
                        logger.info(f"Updated: {page_data['name']}({page_data['section']})")
                    else:
                        # Insert new page
                        session.execute(
                            text("""
                                INSERT INTO man_pages (
                                    id, name, section, title, description, synopsis,
                                    content, category, related_commands, meta_data,
                                    is_common, view_count, cache_priority, created_at
                                ) VALUES (
                                    :id::uuid, :name, :section, :title, :description, :synopsis,
                                    :content::jsonb, :category, :related_commands, :meta_data::jsonb,
                                    :is_common, :view_count, :cache_priority, NOW()
                                )
                            """),
                            {
                                "id": page_data['id'],
                                "name": page_data['name'],
                                "section": page_data['section'],
                                "title": page_data['title'],
                                "description": page_data['description'],
                                "synopsis": page_data['synopsis'],
                                "content": json.dumps(page_data['content']),
                                "category": page_data['category'],
                                "related_commands": page_data['related_commands'],
                                "meta_data": json.dumps(page_data['meta_data']),
                                "is_common": page_data['is_common'],
                                "view_count": 0,
                                "cache_priority": page_data['cache_priority']
                            }
                        )
                        logger.info(f"Inserted: {page_data['name']}({page_data['section']})")
                    
                    stored_count += 1
                    self.extraction_stats['success'] += 1
                    
                    # Track category stats
                    category = page_data['category']
                    if category not in self.extraction_stats['categories']:
                        self.extraction_stats['categories'][category] = 0
                    self.extraction_stats['categories'][category] += 1
                    
                except Exception as e:
                    logger.error(f"Failed to store {page_data['name']}({page_data['section']}): {e}")
                    self.extraction_stats['failed'] += 1
                    session.rollback()
                    continue
            
            session.commit()
            logger.info(f"Stored {stored_count} man pages to database")
            
        except Exception as e:
            logger.error(f"Database error: {e}")
            session.rollback()
            raise
        finally:
            session.close()
    
    async def run_extraction(self, incremental: bool = True):
        """Run the complete extraction pipeline."""
        start_time = datetime.utcnow()
        logger.info(f"Starting man page extraction (incremental={incremental})")
        
        try:
            # Install packages if running in container
            if os.path.exists('/.dockerenv'):
                self.install_packages()
            
            # Discover man pages
            man_pages = self.discover_man_pages()
            self.extraction_stats['total'] = len(man_pages)
            
            # Process in batches
            batch_size = 50
            all_parsed = []
            
            for i in range(0, len(man_pages), batch_size):
                batch = man_pages[i:i+batch_size]
                logger.info(f"Processing batch {i//batch_size + 1}/{(len(man_pages) + batch_size - 1)//batch_size}")
                
                parsed_batch = []
                for name, section, file_path in batch:
                    parsed = self.parse_man_page(name, section, file_path)
                    if parsed:
                        parsed_batch.append(parsed)
                
                # Store batch to database
                if parsed_batch:
                    await self.store_to_database(parsed_batch)
                    all_parsed.extend(parsed_batch)
            
            # Update search vectors
            logger.info("Updating search vectors...")
            session = self.SessionLocal()
            try:
                session.execute(text("""
                    UPDATE man_pages 
                    SET search_vector = 
                        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
                        setweight(to_tsvector('english', coalesce(title, '')), 'B') ||
                        setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
                        setweight(to_tsvector('english', coalesce(synopsis, '')), 'D')
                    WHERE search_vector IS NULL OR updated_at > NOW() - INTERVAL '1 hour'
                """))
                session.commit()
            finally:
                session.close()
            
            # Log statistics
            duration = (datetime.utcnow() - start_time).total_seconds()
            logger.info(f"Extraction completed in {duration:.2f} seconds")
            logger.info(f"Statistics: {json.dumps(self.extraction_stats, indent=2)}")
            
            # Store extraction metadata
            self.store_extraction_metadata(start_time, duration)
            
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            raise
    
    def store_extraction_metadata(self, start_time: datetime, duration: float):
        """Store metadata about the extraction run."""
        session = self.SessionLocal()
        try:
            session.execute(
                text("""
                    INSERT INTO cache_metadata (
                        id, cache_key, cache_type, data, created_at
                    ) VALUES (
                        uuid_generate_v4(), :cache_key, :cache_type, :data::jsonb, NOW()
                    )
                    ON CONFLICT (cache_key) DO UPDATE
                    SET data = :data::jsonb, created_at = NOW()
                """),
                {
                    "cache_key": "extraction_metadata",
                    "cache_type": "extraction",
                    "data": json.dumps({
                        "start_time": start_time.isoformat(),
                        "duration_seconds": duration,
                        "stats": self.extraction_stats,
                        "timestamp": datetime.utcnow().isoformat()
                    })
                }
            )
            session.commit()
        finally:
            session.close()


async def main():
    """Main entry point for the extraction pipeline."""
    # Get database URL from environment
    db_url = os.getenv('DATABASE_URL', os.getenv('DATABASE_PUBLIC_URL'))
    if not db_url:
        raise ValueError("DATABASE_URL or DATABASE_PUBLIC_URL environment variable is required")
    
    # Initialize extractor
    extractor = ManPageExtractor(db_url)
    
    # Run extraction
    await extractor.run_extraction(incremental=True)


if __name__ == "__main__":
    asyncio.run(main())