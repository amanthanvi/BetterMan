#!/usr/bin/env python3
"""
Update document content directly using raw SQL.
"""

import os
import json
import logging
import sqlite3
from src.parser.system_man_loader import parse_man_page_structure

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database path
DB_PATH = 'db_data/betterman.db'

def load_groff_file(file_path):
    """Load and parse a groff man page file"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # Parse the man page structure
        parsed_data = parse_man_page_structure(content)
        return parsed_data, content
    except Exception as e:
        logger.error(f"Error loading {file_path}: {e}")
        return None, None

def update_documents():
    """Update documents with real content"""
    conn = sqlite3.connect(DB_PATH)
    conn.isolation_level = None  # Autocommit mode
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
        
        # Load and parse the groff file
        parsed_data, raw_content = load_groff_file(groff_path)
        if not parsed_data:
            continue
        
        # Prepare content data
        content_data = {
            'sections': parsed_data.get('sections', []),
            'examples': [],
            'see_also': []
        }
        
        # Extract examples and see_also from sections
        for section in parsed_data.get('sections', []):
            if section['name'].upper() == 'EXAMPLES':
                content_data['examples'] = [section['content']]
            elif section['name'].upper() in ['SEE ALSO', 'SEE_ALSO']:
                content_data['see_also'] = [section['content']]
        
        # Update the document with direct SQL
        try:
            # Use parameterized query to avoid SQL injection
            sql = """
                UPDATE documents 
                SET content = ?, 
                    raw_content = ?,
                    title = ?,
                    summary = ?
                WHERE id = ?
            """
            
            cursor.execute(sql, (
                json.dumps(content_data),
                raw_content,
                parsed_data.get('title', f"{name} - manual page"),
                parsed_data['sections'][0]['content'][:200] + '...' if parsed_data['sections'] else '',
                doc_id
            ))
            
            updated_count += 1
            logger.info(f"Updated: {name} (section {section})")
        except Exception as e:
            logger.error(f"Error updating {name}: {e}")
            logger.error(f"SQL error details: {type(e).__name__}")
    
    conn.close()
    
    logger.info(f"Successfully updated {updated_count} documents with real content")

def main():
    """Main function"""
    logger.info("Starting document content update")
    
    # First, let's check if there are any triggers
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='trigger'")
    triggers = cursor.fetchall()
    if triggers:
        logger.info("Found triggers:")
        for name, sql in triggers:
            logger.info(f"  {name}")
    conn.close()
    
    update_documents()

if __name__ == '__main__':
    main()