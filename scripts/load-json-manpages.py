#!/usr/bin/env python3
"""
Load man pages from JSON files into the database.
This script reads the parsed man pages and updates the database with proper content.
"""

import json
import os
import sys
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.models.document import Document, Base
from src.config import get_settings

settings = get_settings()

def load_json_manpages():
    """Load man pages from JSON files into the database."""
    # Create database connection
    engine = create_engine(settings.DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    # Path to JSON files
    json_path = Path("/app/data/man-pages")
    if not json_path.exists():
        # Try alternate path if running locally
        json_path = Path("data/man-pages")
    
    if not json_path.exists():
        print(f"Error: JSON directory not found at {json_path}")
        return
    
    json_files = list(json_path.glob("*.json"))
    print(f"Found {len(json_files)} JSON files to process")
    
    loaded_count = 0
    updated_count = 0
    error_count = 0
    
    for json_file in json_files:
        try:
            # Read JSON file
            with open(json_file, 'r') as f:
                data = json.load(f)
            
            # Extract name and section from filename (e.g., "ls.1.json")
            parts = json_file.stem.split('.')
            if len(parts) >= 2:
                name = parts[0]
                section = parts[1]
            else:
                print(f"Warning: Could not parse filename {json_file.name}")
                continue
            
            # Check if document already exists
            existing_doc = session.query(Document).filter_by(
                name=name, 
                section=section
            ).first()
            
            # Prepare content with options and examples
            content_data = {
                "sections": data.get("sections", []),
                "options": data.get("flags", data.get("options", [])),  # Support both 'flags' and 'options'
                "examples": data.get("examples", []),
                "keywords": data.get("keywords", []),
                "complexity": data.get("complexity", "basic"),
                "hasInteractiveExamples": data.get("hasInteractiveExamples", False),
                "hasDiagrams": data.get("hasDiagrams", False)
            }
            
            if existing_doc:
                # Update existing document
                existing_doc.title = data.get("title", f"{name} manual page")
                existing_doc.summary = data.get("description", data.get("summary", ""))
                existing_doc.content = json.dumps(content_data)
                existing_doc.category = data.get("category", "User Commands")
                existing_doc.is_common = data.get("isCommon", False)
                existing_doc.updated_at = datetime.utcnow()
                updated_count += 1
            else:
                # Create new document
                new_doc = Document(
                    name=name,
                    section=section,
                    title=data.get("title", f"{name} manual page"),
                    summary=data.get("description", data.get("summary", "")),
                    content=json.dumps(content_data),
                    raw_content=data.get("synopsis", ""),
                    category=data.get("category", "User Commands"),
                    is_common=data.get("isCommon", False),
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                session.add(new_doc)
                loaded_count += 1
            
            # Commit every 100 documents
            if (loaded_count + updated_count) % 100 == 0:
                session.commit()
                print(f"Progress: {loaded_count} loaded, {updated_count} updated...")
                
        except Exception as e:
            print(f"Error processing {json_file}: {e}")
            error_count += 1
            session.rollback()
            continue
    
    # Final commit
    try:
        session.commit()
        print(f"\nCompleted!")
        print(f"- Loaded: {loaded_count} new documents")
        print(f"- Updated: {updated_count} existing documents")
        print(f"- Errors: {error_count}")
    except Exception as e:
        print(f"Error during final commit: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    load_json_manpages()