#!/usr/bin/env python3
"""
Update documents with properly parsed groff content.
"""

import os
import json
import logging
import sqlite3
from parse_groff_files import parse_groff_man_page

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database path
DB_PATH = 'db_data/betterman.db'

def update_documents():
    """Update documents with properly parsed content"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    base_dir = os.path.join(os.path.dirname(__file__), 'generated_manpages')
    
    updated_count = 0
    
    # Get all documents
    cursor.execute("SELECT id, name, section FROM documents")
    documents = cursor.fetchall()
    
    for doc_id, name, section in documents:
        # Find the corresponding groff file
        section_dir = f"man{section}"
        groff_path = os.path.join(base_dir, section_dir, f"{name}.{section}")
        
        if not os.path.exists(groff_path):
            logger.warning(f"Groff file not found for {name}.{section}")
            continue
        
        try:
            # Load and parse the groff file
            with open(groff_path, 'r', encoding='utf-8', errors='ignore') as f:
                raw_content = f.read()
            
            parsed_data = parse_groff_man_page(raw_content)
            
            # Prepare content data
            content_data = {
                'sections': parsed_data.get('sections', []),
                'examples': [],
                'see_also': []
            }
            
            # Extract examples and see_also from sections
            for section in parsed_data.get('sections', []):
                if section['name'] == 'EXAMPLES':
                    content_data['examples'] = [section['content']]
                elif section['name'] == 'SEE ALSO':
                    content_data['see_also'] = [section['content']]
            
            # Update the document
            cursor.execute("""
                UPDATE documents 
                SET content = ?, 
                    raw_content = ?,
                    title = ?,
                    summary = ?
                WHERE id = ?
            """, (
                json.dumps(content_data),
                raw_content,
                parsed_data.get('title', f"{name} - manual page"),
                parsed_data['sections'][0]['content'][:200] + '...' if parsed_data['sections'] else '',
                doc_id
            ))
            updated_count += 1
            logger.info(f"Updated: {name} (section {section}) - {len(parsed_data['sections'])} sections")
            
        except Exception as e:
            logger.error(f"Error updating {name}: {e}")
    
    conn.commit()
    conn.close()
    
    logger.info(f"Successfully updated {updated_count} documents with properly parsed content")

def main():
    """Main function"""
    logger.info("Starting document content update with proper groff parsing")
    update_documents()

if __name__ == '__main__':
    main()