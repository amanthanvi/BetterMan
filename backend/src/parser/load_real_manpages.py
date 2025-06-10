#!/usr/bin/env python3
"""
Load real man pages from the system into BetterMan database.
This script should be run inside the Docker container.
"""

import os
import sys
import logging
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.db.session import get_db
from src.models.document import Document
from src.parser.enhanced_groff_parser import EnhancedGroffParser

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class RealManPageLoader:
    """Load real man pages from the host system."""
    
    def __init__(self):
        self.parser = EnhancedGroffParser()
        self.stats = {
            'loaded': 0,
            'updated': 0,
            'errors': 0,
            'skipped': 0
        }
    
    def load_from_directory(self, directory: Path) -> Dict[str, int]:
        """Load man pages from a directory."""
        if not directory.exists():
            logger.error(f"Directory not found: {directory}")
            return self.stats
        
        logger.info(f"Loading man pages from {directory}")
        
        with next(get_db()) as db:
            for filepath in sorted(directory.iterdir()):
                if not filepath.is_file():
                    continue
                
                try:
                    self._process_file(filepath, db)
                except Exception as e:
                    logger.error(f"Error processing {filepath}: {e}")
                    self.stats['errors'] += 1
            
            db.commit()
            logger.info("Database commit completed")
        
        return self.stats
    
    def _process_file(self, filepath: Path, db) -> None:
        """Process a single man page file."""
        # Extract command name and detect format
        if filepath.suffix == '.man':
            command = filepath.stem
            is_raw = True
        elif filepath.suffix == '.txt':
            command = filepath.stem
            is_raw = False
        elif filepath.suffix in ['.gz', '.bz2', '.xz']:
            # Compressed man page
            command = filepath.stem.split('.')[0]
            is_raw = True
        else:
            logger.debug(f"Skipping unknown file type: {filepath}")
            self.stats['skipped'] += 1
            return
        
        logger.info(f"Processing: {command} from {filepath.name}")
        
        # Read content
        content = self._read_file(filepath)
        if not content:
            logger.warning(f"Empty or unreadable file: {filepath}")
            self.stats['skipped'] += 1
            return
        
        # Parse the content
        try:
            if is_raw:
                parsed_data = self.parser.parse(content)
            else:
                # Pre-formatted text - create basic structure
                parsed_data = self._parse_formatted_text(command, content)
        except Exception as e:
            logger.error(f"Parse error for {command}: {e}")
            self.stats['errors'] += 1
            return
        
        # Store in database
        self._store_document(command, parsed_data, content, db)
    
    def _read_file(self, filepath: Path) -> Optional[str]:
        """Read file content, handling compression."""
        try:
            if filepath.suffix == '.gz':
                import gzip
                with gzip.open(filepath, 'rt', encoding='utf-8', errors='replace') as f:
                    return f.read()
            elif filepath.suffix == '.bz2':
                import bz2
                with bz2.open(filepath, 'rt', encoding='utf-8', errors='replace') as f:
                    return f.read()
            elif filepath.suffix == '.xz':
                import lzma
                with lzma.open(filepath, 'rt', encoding='utf-8', errors='replace') as f:
                    return f.read()
            else:
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    return f.read()
        except Exception as e:
            logger.error(f"Error reading {filepath}: {e}")
            return None
    
    def _parse_formatted_text(self, command: str, content: str) -> Dict:
        """Create basic structure from pre-formatted text."""
        lines = content.strip().split('\n')
        
        # Try to extract title from first line
        title = command.upper()
        if lines and '(' in lines[0] and ')' in lines[0]:
            title = lines[0].strip()
        
        # Extract section number if present
        section = '1'
        if '(' in title and ')' in title:
            try:
                section_part = title.split('(')[1].split(')')[0]
                if section_part.isdigit():
                    section = section_part
            except:
                pass
        
        return {
            'title': title,
            'section': section,
            'name': command,
            'synopsis': '',
            'description': content,
            'options': [],
            'examples': [],
            'see_also': [],
            'sections': [
                {
                    'name': 'DESCRIPTION',
                    'content': content
                }
            ]
        }
    
    def _store_document(self, command: str, parsed_data: Dict, raw_content: str, db) -> None:
        """Store or update document in database."""
        # Check if document exists
        existing = db.query(Document).filter(
            Document.name == command
        ).first()
        
        # Prepare document data
        doc_data = {
            'name': command,
            'section': str(parsed_data.get('section', '1')),
            'title': parsed_data.get('title', command.upper()),
            'summary': parsed_data.get('description', '')[:500],
            'content': parsed_data,
            'raw_content': raw_content[:1000000],  # Limit size
            'category': self._determine_category(parsed_data.get('section', '1')),
            'tags': ','.join([
                'real',
                'system',
                f"section-{parsed_data.get('section', '1')}",
                'linux'
            ]),
            'meta_info': {
                'source': 'system',
                'loaded_at': datetime.utcnow().isoformat(),
                'parser': 'enhanced_groff',
                'has_examples': bool(parsed_data.get('examples')),
                'has_options': bool(parsed_data.get('options'))
            }
        }
        
        if existing:
            # Update existing
            for key, value in doc_data.items():
                setattr(existing, key, value)
            existing.updated_at = datetime.utcnow()
            self.stats['updated'] += 1
            logger.info(f"Updated: {command}")
        else:
            # Create new
            doc = Document(**doc_data)
            db.add(doc)
            self.stats['loaded'] += 1
            logger.info(f"Loaded: {command}")
    
    def _determine_category(self, section: str) -> str:
        """Determine category based on section number."""
        section_map = {
            '1': 'user-commands',
            '2': 'system-calls',
            '3': 'library-functions',
            '4': 'special-files',
            '5': 'file-formats',
            '6': 'games',
            '7': 'miscellaneous',
            '8': 'system-admin',
            '9': 'kernel-routines'
        }
        return section_map.get(str(section), 'other')


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        # Default to loading from mounted directory
        directory = Path('/app/data/real_manpages')
    else:
        directory = Path(sys.argv[1])
    
    loader = RealManPageLoader()
    stats = loader.load_from_directory(directory)
    
    print("\n" + "="*50)
    print("Loading complete!")
    print(f"  New documents: {stats['loaded']}")
    print(f"  Updated documents: {stats['updated']}")
    print(f"  Errors: {stats['errors']}")
    print(f"  Skipped: {stats['skipped']}")
    
    # Show total count
    with next(get_db()) as db:
        total = db.query(Document).count()
        print(f"  Total in database: {total}")
    
    print("="*50 + "\n")
    
    # Exit with error code if there were failures
    if stats['errors'] > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()