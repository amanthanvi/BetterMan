"""
Simple synchronous man page loader that works with the existing database setup.
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

from ..models.document import Document
from ..db.session import get_db_context
from .enhanced_groff_parser import EnhancedGroffParser
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class SimpleManPageLoader:
    """Simple loader for man pages."""
    
    def __init__(self):
        self.parser = EnhancedGroffParser()
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
    
    def process_man_page(self, file_path: Path, section: str) -> Optional[Document]:
        """Process a single man page."""
        try:
            # Extract name
            name = self.extract_name(file_path)
            
            # Check if already exists
            with get_db_context() as db:
                existing = db.query(Document).filter_by(name=name, section=section).first()
                if existing:
                    logger.debug(f"Skipping {name}.{section} - already exists")
                    self.skipped_count += 1
                    return None
            
            # Read content
            content = self.read_man_file(file_path)
            if not content:
                return None
            
            # Parse with groff parser
            parsed = self.parser.parse(content)
            if not parsed:
                logger.warning(f"Failed to parse {name}.{section}")
                self.error_count += 1
                return None
            
            # Create document
            doc = Document(
                name=name,
                section=section,
                title=parsed.get('title', f"{name}({section})"),
                summary=parsed.get('summary', '')[:500],  # Limit summary length
                content=parsed.get('content', ''),
                raw_content=content[:10000],  # Store first 10KB of raw content
                file_path=str(file_path),
                cache_status='indexed',
                meta_info=parsed  # Store parsed data as JSON
            )
            
            # Store in database
            with get_db_context() as db:
                db.add(doc)
                db.commit()
                logger.info(f"✅ Loaded {name}.{section}")
                self.processed_count += 1
                
                # Cache will be updated by the API when accessed
                
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
        """Load man pages from the system."""
        logger.info("🚀 Starting man page loading...")
        
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


def load_man_pages_cli(directories: Optional[List[str]] = None,
                      sections: Optional[List[str]] = None,
                      batch_size: int = 50):
    """CLI interface for loading man pages."""
    loader = SimpleManPageLoader()
    stats = loader.load_man_pages(
        directories=directories,
        sections=sections,
        batch_size=batch_size
    )
    return stats