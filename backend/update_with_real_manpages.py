#!/usr/bin/env python3
"""Update existing documents with real man page content."""

import os
import sys
import json
import logging
from pathlib import Path
from datetime import datetime

sys.path.insert(0, '/app')

from src.db.session import get_db
from src.models.document import Document
from src.parser.enhanced_groff_parser import EnhancedGroffParser

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    parser = EnhancedGroffParser()
    stats = {'updated': 0, 'errors': 0, 'skipped': 0}
    
    manpage_dir = Path('/tmp/real_manpages_export')
    if not manpage_dir.exists():
        logger.error("Man pages directory not found")
        return
    
    logger.info(f"Updating documents with real man pages from {manpage_dir}")
    
    with next(get_db()) as db:
        # Get list of existing documents
        existing_docs = {doc.name: doc for doc in db.query(Document).all()}
        logger.info(f"Found {len(existing_docs)} existing documents")
        
        for filepath in sorted(manpage_dir.iterdir()):
            if not filepath.is_file():
                continue
            
            # Extract command name
            command = filepath.stem.split('.')[0]  # Handle "command.5.man" format
            
            if command not in existing_docs:
                logger.debug(f"Skipping {command} - not in database")
                stats['skipped'] += 1
                continue
            
            try:
                logger.info(f"Updating: {command}")
                
                # Read content
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
                
                if not content.strip():
                    logger.warning(f"Empty file: {command}")
                    stats['skipped'] += 1
                    continue
                
                # Update the existing document
                doc = existing_docs[command]
                
                # Determine if it's raw groff or pre-formatted
                is_raw = filepath.suffix == '.man' or (
                    content.startswith('.') and any(
                        content.startswith(cmd) for cmd in ['.TH', '.SH', '.\\\"', '.Dd']
                    )
                )
                
                if is_raw:
                    # Try to clean the groff formatting
                    try:
                        cleaned_content = parser.clean_text(content)
                        # Create a simple parsed structure
                        parsed = {
                            'title': doc.title or command.upper(),
                            'section': doc.section or '1',
                            'name': command,
                            'synopsis': '',
                            'description': cleaned_content,
                            'options': [],
                            'examples': [],
                            'see_also': [],
                            'sections': [
                                {
                                    'name': 'DESCRIPTION',
                                    'content': cleaned_content
                                }
                            ]
                        }
                    except Exception as e:
                        logger.warning(f"Clean error for {command}: {e}")
                        # Fall back to raw content
                        parsed = {
                            'title': doc.title or command.upper(),
                            'section': doc.section or '1',
                            'name': command,
                            'description': content,
                            'sections': [{'name': 'DESCRIPTION', 'content': content}]
                        }
                else:
                    # Pre-formatted text
                    parsed = {
                        'title': doc.title or command.upper(),
                        'section': doc.section or '1',
                        'name': command,
                        'description': content,
                        'sections': [{'name': 'DESCRIPTION', 'content': content}]
                    }
                
                # Update document
                doc.content = json.dumps(parsed)
                doc.raw_content = content[:500000]  # Limit size
                doc.tags = 'real,system'
                if doc.meta_info:
                    doc.meta_info['source'] = 'system'
                    doc.meta_info['updated_at'] = datetime.utcnow().isoformat()
                else:
                    doc.meta_info = {
                        'source': 'system',
                        'updated_at': datetime.utcnow().isoformat()
                    }
                
                stats['updated'] += 1
                logger.info(f"Updated: {command}")
                
            except Exception as e:
                logger.error(f"Error updating {command}: {e}")
                stats['errors'] += 1
                continue
        
        db.commit()
        logger.info("Database commit completed")
    
    logger.info(f"\nResults: Updated={stats['updated']}, Errors={stats['errors']}, Skipped={stats['skipped']}")

if __name__ == '__main__':
    main()