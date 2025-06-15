#!/usr/bin/env python3
"""
Populate the database with real man pages from the generated_manpages directory.
This script is designed to work with the existing JSON files.
"""

import os
import json
import logging
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.models.document import Document, Base

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./db_data/betterman.db')

def init_database():
    """Initialize the database"""
    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    return engine

def load_json_manpage(json_path):
    """Load a man page from JSON file"""
    try:
        with open(json_path, 'r') as f:
            data = json.load(f)
        return data
    except Exception as e:
        logger.error(f"Error loading {json_path}: {e}")
        return None

def populate_from_generated_manpages(session):
    """Populate database from generated_manpages directory"""
    base_dir = os.path.join(os.path.dirname(__file__), 'generated_manpages')
    
    if not os.path.exists(base_dir):
        logger.error(f"Directory {base_dir} does not exist")
        return
    
    loaded_count = 0
    
    # Iterate through all man sections
    for section_dir in ['man1', 'man2', 'man3', 'man5', 'man6', 'man8']:
        section_path = os.path.join(base_dir, section_dir)
        if not os.path.exists(section_path):
            continue
            
        logger.info(f"Processing section: {section_dir}")
        
        # Get all JSON files in the section
        json_files = [f for f in os.listdir(section_path) if f.endswith('.json')]
        
        for json_file in json_files:
            json_path = os.path.join(section_path, json_file)
            data = load_json_manpage(json_path)
            
            if not data:
                continue
            
            # Extract command name (without .json extension)
            command_name = json_file.replace('.json', '')
            if command_name.endswith('.1') or command_name.endswith('.2') or \
               command_name.endswith('.3') or command_name.endswith('.5') or \
               command_name.endswith('.6') or command_name.endswith('.8'):
                command_name = command_name[:-2]
            
            # Check if document already exists
            existing = session.query(Document).filter_by(
                name=command_name,
                section=data.get('section', '1')
            ).first()
            
            if existing:
                logger.info(f"Skipping {command_name} (already exists)")
                continue
            
            # Create document
            try:
                # Prepare content as JSON
                content_data = {
                    'sections': data.get('sections', []),
                    'examples': data.get('examples', []),
                    'see_also': data.get('see_also', [])
                }
                
                doc = Document(
                    name=command_name,
                    title=data.get('title', f"{command_name} - manual page"),
                    section=str(data.get('section', '1')),
                    summary=data.get('description', ''),
                    content=json.dumps(content_data),
                    raw_content=data.get('raw_content', ''),
                    category=data.get('category', 'general'),
                    tags=','.join(data.get('tags', [])) if data.get('tags') else None,
                    is_common=command_name in ['ls', 'cd', 'grep', 'find', 'cat', 'echo', 'mkdir', 'rm', 'cp', 'mv'],
                    meta_info=data.get('metadata', {}),
                    priority=int(section_dir[-1])  # Use section number as priority
                )
                
                session.add(doc)
                session.commit()
                loaded_count += 1
                logger.info(f"Loaded: {command_name} (section {doc.section})")
                
            except Exception as e:
                logger.error(f"Error creating document for {command_name}: {e}")
                session.rollback()
                continue
    
    logger.info(f"Successfully loaded {loaded_count} man pages")

def populate_from_extracted_manpages(session):
    """Populate database from extracted_manpages directory (fallback)"""
    base_dir = os.path.join(os.path.dirname(__file__), 'extracted_manpages')
    
    if not os.path.exists(base_dir):
        logger.error(f"Directory {base_dir} does not exist")
        return
    
    loaded_count = 0
    
    # Get all .plain files
    plain_files = [f for f in os.listdir(base_dir) if f.endswith('.plain')]
    
    for plain_file in plain_files:
        # Extract command name
        command_name = plain_file.replace('.1.plain', '').replace('.plain', '')
        
        # Check if already exists
        existing = session.query(Document).filter_by(name=command_name).first()
        if existing:
            continue
        
        # Read the plain text content
        try:
            with open(os.path.join(base_dir, plain_file), 'r') as f:
                content = f.read()
            
            # Extract title from first line
            lines = content.split('\n')
            title = lines[0] if lines else f"{command_name} - manual page"
            
            # Create a basic document
            doc = Document(
                name=command_name,
                title=title,
                section='1',
                summary=f"Manual page for {command_name}",
                content=json.dumps({'sections': [{'name': 'CONTENT', 'content': content}]}),
                raw_content=content,
                category='general',
                is_common=command_name in ['ls', 'cd', 'grep', 'find', 'cat', 'echo', 'mkdir', 'rm', 'cp', 'mv']
            )
            
            session.add(doc)
            session.commit()
            loaded_count += 1
            logger.info(f"Loaded plain text: {command_name}")
            
        except Exception as e:
            logger.error(f"Error loading {plain_file}: {e}")
            session.rollback()
            continue
    
    logger.info(f"Loaded {loaded_count} plain text man pages")

def main():
    """Main function"""
    logger.info("Starting man page population for Vercel deployment")
    
    # Initialize database
    engine = init_database()
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Try to load from generated_manpages first
        populate_from_generated_manpages(session)
        
        # If no documents loaded, try extracted_manpages
        doc_count = session.query(Document).count()
        if doc_count == 0:
            logger.info("No documents from generated_manpages, trying extracted_manpages")
            populate_from_extracted_manpages(session)
        
        # Final count
        final_count = session.query(Document).count()
        logger.info(f"Total documents in database: {final_count}")
        
    except Exception as e:
        logger.error(f"Error during population: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    main()