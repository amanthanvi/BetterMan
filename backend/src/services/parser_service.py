"""
Parser service for processing man pages and other documentation.
"""

from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.orm import Session
import logging
import hashlib

from .base import BaseService
from .cache_service import CacheService
from ..parser.groff_parser import GroffParser
from ..parser.linux_parser import LinuxManParser
from ..parser.man_utils import fetch_man_page_content, get_available_man_pages
from ..models.document import Document, Section as SectionModel
from ..errors import ParseError, NotFoundError


class ParserService(BaseService):
    """Service for parsing documentation with caching."""
    
    def __init__(self, db: Session, cache_service: Optional[CacheService] = None):
        """
        Initialize parser service.
        
        Args:
            db: Database session
            cache_service: Optional cache service
        """
        super().__init__(db)
        self.cache = cache_service
        self.groff_parser = GroffParser()
        self.linux_parser = LinuxManParser()
        self.logger = logging.getLogger(__name__)
    
    def parse_man_page(
        self,
        command: str,
        section: Optional[str] = None,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Parse a man page with caching.
        
        Args:
            command: Command name
            section: Optional section number
            force_refresh: Force re-parse even if cached
            
        Returns:
            Parsed document data
        """
        # Generate cache key
        cache_key = f"parsed:{command}:{section or 'any'}"
        
        # Check cache unless forced refresh
        if not force_refresh and self.cache:
            cached = self.cache.get(cache_key)
            if cached:
                self.logger.debug(f"Using cached parse for {command}")
                return cached
        
        # Fetch raw content
        content, error = fetch_man_page_content(command, section)
        if error or not content:
            raise NotFoundError("Man page", f"{command}({section or 'any'})")
        
        # Parse content
        try:
            # Try groff parser first for better formatting
            parsed = self.groff_parser.parse(content)
            
            # Enhance with metadata
            parsed['name'] = command
            parsed['section'] = section or self._extract_section(content)
            parsed['source'] = 'system'
            
            # Generate content hash for change detection
            parsed['content_hash'] = hashlib.md5(content.encode()).hexdigest()
            
            # Cache the result
            if self.cache:
                ttl = CacheService.TTL_PERMANENT if self._is_stable_command(command) else CacheService.TTL_FREQUENT
                self.cache.set(cache_key, parsed, ttl)
            
            return parsed
            
        except Exception as e:
            self.logger.error(f"Groff parser failed for {command}: {e}")
            
            # Fallback to Linux parser
            try:
                parsed = self.linux_parser.parse_man_page(command, section)
                
                # Cache with shorter TTL for fallback parser
                if self.cache:
                    self.cache.set(cache_key, parsed, CacheService.TTL_DEFAULT)
                
                return parsed
                
            except Exception as fallback_error:
                self.logger.error(f"All parsers failed for {command}: {fallback_error}")
                raise ParseError(f"Failed to parse man page: {command}", command)
    
    def _extract_section(self, content: str) -> Optional[int]:
        """Extract section number from man page content."""
        import re
        
        # Look for .TH line
        match = re.search(r'\.TH\s+\S+\s+(\d+)', content)
        if match:
            return int(match.group(1))
        
        # Look for section in header
        match = re.search(r'\((\d+)\)', content[:200])
        if match:
            return int(match.group(1))
        
        return None
    
    def _is_stable_command(self, command: str) -> bool:
        """Check if command is stable (unlikely to change)."""
        stable_commands = {
            'ls', 'cd', 'pwd', 'cp', 'mv', 'rm', 'mkdir', 'rmdir',
            'cat', 'echo', 'grep', 'sed', 'awk', 'find', 'sort',
            'head', 'tail', 'wc', 'cut', 'paste', 'tr', 'uniq',
            'chmod', 'chown', 'chgrp', 'touch', 'ln', 'df', 'du',
            'ps', 'kill', 'top', 'free', 'uptime', 'who', 'w'
        }
        return command.lower() in stable_commands
    
    def batch_parse(
        self,
        commands: List[Tuple[str, Optional[str]]],
        max_workers: int = 4
    ) -> Dict[str, Dict[str, Any]]:
        """
        Parse multiple man pages in batch.
        
        Args:
            commands: List of (command, section) tuples
            max_workers: Maximum concurrent parsers
            
        Returns:
            Dictionary mapping command to parsed data
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        results = {}
        
        def parse_single(cmd_section):
            cmd, section = cmd_section
            try:
                return cmd, self.parse_man_page(cmd, section)
            except Exception as e:
                self.logger.error(f"Failed to parse {cmd}: {e}")
                return cmd, None
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(parse_single, cmd_sec): cmd_sec[0]
                for cmd_sec in commands
            }
            
            for future in as_completed(futures):
                cmd, parsed = future.result()
                if parsed:
                    results[cmd] = parsed
        
        return results
    
    def update_database(
        self,
        parsed_data: Dict[str, Any],
        update_existing: bool = True
    ) -> Document:
        """
        Update database with parsed document.
        
        Args:
            parsed_data: Parsed document data
            update_existing: Whether to update existing documents
            
        Returns:
            Created or updated document
        """
        name = parsed_data['name']
        
        # Check if exists
        existing = self.db.query(Document).filter(Document.name == name).first()
        
        if existing and not update_existing:
            return existing
        
        # Prepare document data
        doc_data = {
            'name': name,
            'title': parsed_data.get('title', name).upper(),
            'section': parsed_data.get('section'),
            'summary': parsed_data.get('summary', ''),
            'content': parsed_data.get('raw_content', ''),
            'category': self._determine_category(name, parsed_data),
            'is_common': self._is_stable_command(name),
            'cache_status': 'permanent' if self._is_stable_command(name) else 'on_demand'
        }
        
        if existing:
            # Update existing
            for key, value in doc_data.items():
                setattr(existing, key, value)
            document = existing
        else:
            # Create new
            document = Document(**doc_data)
            self.db.add(document)
        
        # Add sections
        if 'sections' in parsed_data:
            # Remove old sections
            if existing:
                self.db.query(SectionModel).filter(
                    SectionModel.document_id == document.id
                ).delete()
            
            # Add new sections
            for idx, section_data in enumerate(parsed_data['sections']):
                section = SectionModel(
                    document_id=document.id,
                    name=section_data.get('name', ''),
                    content=section_data.get('content', ''),
                    order=idx
                )
                self.db.add(section)
        
        self.commit()
        
        # Invalidate cache
        if self.cache:
            self.cache.delete(f"doc:{name}")
        
        return document
    
    def _determine_category(self, name: str, parsed_data: Dict[str, Any]) -> str:
        """Determine document category based on content."""
        section = parsed_data.get('section', 1)
        
        # Category mapping by section
        section_categories = {
            1: 'commands',
            2: 'system_calls',
            3: 'library_calls',
            4: 'devices',
            5: 'file_formats',
            6: 'games',
            7: 'miscellaneous',
            8: 'administration'
        }
        
        # Check for specific command patterns
        if name.startswith('git'):
            return 'version_control'
        elif name.startswith('docker') or name.startswith('podman'):
            return 'containers'
        elif name in ['apt', 'dpkg', 'yum', 'dnf', 'rpm', 'pacman']:
            return 'package_management'
        elif name in ['ssh', 'scp', 'sftp', 'rsync', 'curl', 'wget']:
            return 'networking'
        
        return section_categories.get(section, 'other')
    
    def refresh_all_documents(self, batch_size: int = 10) -> Dict[str, int]:
        """
        Refresh all documents in database.
        
        Args:
            batch_size: Number of documents to process at once
            
        Returns:
            Statistics dictionary
        """
        stats = {
            'total': 0,
            'updated': 0,
            'failed': 0,
            'skipped': 0
        }
        
        # Get all documents
        documents = self.db.query(Document).all()
        stats['total'] = len(documents)
        
        # Process in batches
        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]
            commands = [(doc.name, str(doc.section) if doc.section else None) for doc in batch]
            
            # Parse batch
            parsed_batch = self.batch_parse(commands)
            
            # Update database
            for doc in batch:
                if doc.name in parsed_batch:
                    try:
                        self.update_database(parsed_batch[doc.name])
                        stats['updated'] += 1
                    except Exception as e:
                        self.logger.error(f"Failed to update {doc.name}: {e}")
                        stats['failed'] += 1
                else:
                    stats['skipped'] += 1
        
        return stats