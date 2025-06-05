"""
Improved man page loader that properly parses and stores sections.
"""

import os
import gzip
import bz2
import lzma
import logging
import subprocess
from pathlib import Path
from typing import List, Dict, Optional, Set
from concurrent.futures import ThreadPoolExecutor, as_completed

from sqlalchemy.orm import Session
from sqlalchemy import select

from ..models.document import Document, Section, Subsection
from ..db.session import get_db_context
from .enhanced_groff_parser import EnhancedGroffParser
from .formatted_parser import FormattedManPageParser
from ..config import get_settings
from ..cache.cache_manager import CacheManager

logger = logging.getLogger(__name__)
settings = get_settings()

class ImprovedManPageLoader:
    """Improved loader that properly parses man page sections."""
    
    def __init__(self):
        self.groff_parser = EnhancedGroffParser()
        self.formatted_parser = FormattedManPageParser()
        self.processed_count = 0
        self.error_count = 0
        self.skipped_count = 0
        
    def discover_man_pages(self, directories: Optional[List[str]] = None) -> Dict[str, List[Path]]:
        """Discover man pages in the given directories."""
        if directories is None:
            directories = [
                "/usr/share/man",
                "/usr/local/share/man",
                "/usr/man",
                "/usr/local/man",
                os.path.expanduser("~/.local/share/man")
            ]
        
        man_pages = {}
        for directory in directories:
            if not os.path.exists(directory):
                continue
                
            for root, dirs, files in os.walk(directory):
                # Extract section from directory name (e.g., man1, man2, etc.)
                dir_name = os.path.basename(root)
                if dir_name.startswith("man") and len(dir_name) > 3:
                    section = dir_name[3:]
                    
                    for file in files:
                        # Skip non-man files
                        if file.endswith(('.html', '.txt', '.ps', '.pdf')):
                            continue
                            
                        file_path = Path(os.path.join(root, file))
                        
                        # Initialize section if needed
                        if section not in man_pages:
                            man_pages[section] = []
                            
                        man_pages[section].append(file_path)
                        
        return man_pages
    
    def read_man_file(self, file_path: Path) -> Optional[str]:
        """Read a man page file, handling compression."""
        try:
            # Handle compressed files
            if file_path.suffix == '.gz':
                with gzip.open(file_path, 'rt', encoding='utf-8', errors='ignore') as f:
                    return f.read()
            elif file_path.suffix == '.bz2':
                with bz2.open(file_path, 'rt', encoding='utf-8', errors='ignore') as f:
                    return f.read()
            elif file_path.suffix == '.xz':
                with lzma.open(file_path, 'rt', encoding='utf-8', errors='ignore') as f:
                    return f.read()
            else:
                # Try to read as plain text
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    return f.read()
        except Exception as e:
            logger.warning(f"Failed to read {file_path}: {e}")
            return None
    
    def extract_name(self, file_path: Path) -> str:
        """Extract the command name from the file path."""
        name = file_path.stem
        # Remove compression extensions
        for ext in ['.gz', '.bz2', '.xz']:
            if name.endswith(ext):
                name = name[:-len(ext)]
        # Remove section number if present (e.g., ls.1 -> ls)
        if '.' in name:
            name = name.split('.')[0]
        return name
    
    def get_formatted_output(self, name: str, section: str) -> Optional[str]:
        """Get formatted output from man command."""
        try:
            # Use man command to get formatted output
            cmd = ['man', section, name]
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10,
                env={**os.environ, 'MANWIDTH': '80'}
            )
            
            if result.returncode == 0:
                return result.stdout
            else:
                logger.debug(f"man command failed for {name}.{section}: {result.stderr}")
                return None
                
        except subprocess.TimeoutExpired:
            logger.warning(f"man command timed out for {name}.{section}")
            return None
        except Exception as e:
            logger.warning(f"Failed to run man command for {name}.{section}: {e}")
            return None
    
    def parse_content(self, raw_content: str, formatted_content: Optional[str] = None) -> Dict:
        """Parse man page content using the best available method."""
        # Try formatted parser first if we have formatted output
        if formatted_content:
            try:
                parsed = self.formatted_parser.parse(formatted_content)
                if parsed and parsed.get('sections'):
                    return parsed
            except Exception as e:
                logger.debug(f"Formatted parser failed: {e}")
        
        # Fall back to groff parser
        try:
            parsed = self.groff_parser.parse(raw_content)
            if parsed:
                return parsed
        except Exception as e:
            logger.debug(f"Groff parser failed: {e}")
        
        # If both fail, create a basic structure
        return {
            'title': 'Unknown',
            'section': '1',
            'summary': '',
            'sections': [{
                'name': 'CONTENT',
                'content': raw_content[:5000],  # First 5KB
                'subsections': []
            }]
        }
    
    def process_man_page(self, file_path: Path, section: str) -> Optional[Document]:
        """Process a single man page with improved parsing."""
        try:
            # Extract name
            name = self.extract_name(file_path)
            
            # Skip non-English man pages (in subdirectories like fr/, pl/, etc.)
            path_parts = file_path.parts
            if any(part in ['fr', 'pl', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ru'] for part in path_parts):
                logger.debug(f"Skipping non-English man page: {file_path}")
                self.skipped_count += 1
                return None
            
            # Check if already exists
            with get_db_context() as db:
                existing = db.query(Document).filter_by(name=name, section=section).first()
                if existing:
                    logger.debug(f"Skipping {name}.{section} - already exists")
                    self.skipped_count += 1
                    return None
            
            # Read raw content
            raw_content = self.read_man_file(file_path)
            if not raw_content:
                return None
            
            # Get formatted output from man command
            formatted_content = self.get_formatted_output(name, section)
            
            # Parse content using best available method
            parsed = self.parse_content(raw_content, formatted_content)
            
            # Extract title properly
            title = parsed.get('title', '')
            if not title or title == 'Unknown':
                # Try to extract from NAME section
                for section_data in parsed.get('sections', []):
                    if section_data['name'] == 'NAME':
                        # Extract title from NAME section (format: "command - description")
                        content = section_data['content'].strip()
                        if ' - ' in content:
                            title = content.split(' - ', 1)[0].strip()
                        break
                
                # Fallback to name
                if not title:
                    title = name
            
            # Extract summary from NAME section
            summary = parsed.get('summary', '')
            if not summary:
                for section_data in parsed.get('sections', []):
                    if section_data['name'] == 'NAME':
                        content = section_data['content'].strip()
                        if ' - ' in content:
                            summary = content.split(' - ', 1)[1].strip()
                        else:
                            summary = content
                        break
            
            # Create document
            doc = Document(
                name=name,
                section=section,
                title=f"{title} - {summary}" if summary else title,
                summary=summary[:500],  # Limit summary length
                content='',  # Will be populated with sections
                raw_content=raw_content[:10000],  # Store first 10KB of raw content
                file_path=str(file_path),
                cache_status='indexed',
                meta_info=parsed  # Store full parsed data
            )
            
            # Store in database with sections
            with get_db_context() as db:
                db.add(doc)
                db.flush()  # Get the document ID
                
                # Add sections
                for i, section_data in enumerate(parsed.get('sections', [])):
                    section_obj = Section(
                        document_id=doc.id,
                        name=section_data['name'],
                        content=section_data['content'],
                        order=i
                    )
                    db.add(section_obj)
                    db.flush()
                    
                    # Add subsections if any
                    for j, subsection_data in enumerate(section_data.get('subsections', [])):
                        subsection_obj = Subsection(
                            section_id=section_obj.id,
                            name=subsection_data['name'],
                            content=subsection_data['content'],
                            order=j
                        )
                        db.add(subsection_obj)
                
                db.commit()
                logger.info(f"✅ Loaded {name}.{section} with {len(parsed.get('sections', []))} sections")
                self.processed_count += 1
                
            return doc
            
        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")
            self.error_count += 1
            return None
    
    def load_man_pages(self, 
                      directories: Optional[List[str]] = None,
                      sections: Optional[List[str]] = None,
                      batch_size: int = 50,
                      max_workers: int = 4) -> Dict[str, int]:
        """Load man pages from the system with improved parsing."""
        logger.info("🚀 Starting improved man page loading...")
        
        # Discover man pages
        all_pages = self.discover_man_pages(directories)
        
        # Filter by sections if specified
        if sections:
            all_pages = {s: pages for s, pages in all_pages.items() if s in sections}
        
        # Count total
        total_pages = sum(len(pages) for pages in all_pages.values())
        logger.info(f"📊 Found {total_pages} man pages across {len(all_pages)} sections")
        
        # Process in batches
        batch = []
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = []
            
            for section, pages in all_pages.items():
                for page_path in pages:
                    batch.append((page_path, section))
                    
                    if len(batch) >= batch_size:
                        # Submit batch
                        for path, sec in batch:
                            future = executor.submit(self.process_man_page, path, sec)
                            futures.append(future)
                        batch = []
                        
                        # Wait for some to complete
                        if len(futures) >= batch_size * 2:
                            for future in as_completed(futures[:batch_size]):
                                future.result()
                            futures = futures[batch_size:]
            
            # Process remaining
            for path, sec in batch:
                future = executor.submit(self.process_man_page, path, sec)
                futures.append(future)
            
            # Wait for all to complete
            for future in as_completed(futures):
                future.result()
        
        # Return statistics
        stats = {
            "total_found": total_pages,
            "processed": self.processed_count,
            "errors": self.error_count,
            "skipped": self.skipped_count
        }
        
        logger.info(f"✨ Loading complete! Processed: {self.processed_count}, "
                   f"Errors: {self.error_count}, Skipped: {self.skipped_count}")
        
        return stats