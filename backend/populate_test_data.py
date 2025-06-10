#!/usr/bin/env python3
"""Populate database with test data for ls command."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.db.session import SessionLocal
from src.models.document import Document, Section
from datetime import datetime

def populate_ls_command():
    """Add ls command to the database."""
    db = SessionLocal()
    
    try:
        # Check if ls already exists
        existing = db.query(Document).filter(Document.name == "ls").first()
        if existing:
            print("ls command already exists in database")
            return
        
        # Create ls document
        ls_doc = Document(
            name="ls",
            title="ls - list directory contents",
            section="1",
            summary="List information about the FILEs (the current directory by default).",
            raw_content="LS(1)                            User Commands                           LS(1)\n\nNAME\n       ls - list directory contents\n\nSYNOPSIS\n       ls [OPTION]... [FILE]...\n\nDESCRIPTION\n       List  information  about  the FILEs (the current directory by default).\n       Sort entries alphabetically if none of -cftuvSUX nor --sort  is  speci‐\n       fied.",
            is_common=True,
            cache_status="permanent",
            cache_priority=10,
            last_accessed=datetime.utcnow(),
            access_count=0,
        )
        db.add(ls_doc)
        db.flush()
        
        # Add sections
        sections = [
            ("NAME", "ls - list directory contents"),
            ("SYNOPSIS", "ls [OPTION]... [FILE]..."),
            ("DESCRIPTION", "List information about the FILEs (the current directory by default). Sort entries alphabetically if none of -cftuvSUX nor --sort is specified."),
            ("OPTIONS", "-a, --all  do not ignore entries starting with .\n-l  use a long listing format\n-h, --human-readable  with -l and -s, print sizes like 1K 234M 2G etc."),
        ]
        
        for i, (name, content) in enumerate(sections):
            section = Section(
                document_id=ls_doc.id,
                name=name,
                content=content,
                order=i,
            )
            db.add(section)
        
        db.commit()
        print("Successfully added ls command to database")
        
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    populate_ls_command()