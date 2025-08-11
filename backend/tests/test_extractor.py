#!/usr/bin/env python3
"""
Test script for man page extractor.
"""

import sys
import os
import asyncio
import logging
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from app.workers.extractor import ManPageExtractor, ManPageCategory

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


def test_categorization():
    """Test command categorization."""
    test_cases = [
        ('ls', 'file_operations'),
        ('grep', 'text_processing'),
        ('ping', 'network'),
        ('ps', 'process_management'),
        ('uname', 'system_info'),
        ('git', 'development'),
        ('tar', 'archive'),
        ('useradd', 'user_management'),
        ('apt', 'package_management'),
        ('bash', 'shell'),
        ('unknown_cmd', 'general')
    ]
    
    print("Testing command categorization:")
    for cmd, expected_category in test_cases:
        category, info = ManPageCategory.categorize(cmd)
        status = "✓" if category == expected_category else "✗"
        print(f"  {status} {cmd} -> {category} (expected: {expected_category})")
        if category != expected_category:
            print(f"    Info: {info}")


def test_man_page_parsing():
    """Test parsing a single man page."""
    print("\nTesting man page parsing:")
    
    # Create a mock extractor
    extractor = ManPageExtractor("sqlite:///test.db")
    
    # Test parsing common commands
    test_commands = [
        ('ls', '1'),
        ('grep', '1'),
        ('man', '1')
    ]
    
    for name, section in test_commands:
        print(f"\n  Parsing {name}({section}):")
        try:
            result = extractor.parse_man_page(name, section)
            if result:
                print(f"    ✓ Name: {result['name']}")
                print(f"    ✓ Title: {result['title']}")
                print(f"    ✓ Description: {result['description'][:100]}...")
                print(f"    ✓ Category: {result['category']}")
                print(f"    ✓ Options: {len(result['content'].get('options', []))} options found")
                print(f"    ✓ Examples: {len(result['content'].get('examples', []))} examples found")
                print(f"    ✓ See Also: {', '.join(result['content'].get('see_also', []))}")
            else:
                print(f"    ✗ Failed to parse")
        except Exception as e:
            print(f"    ✗ Error: {e}")


def test_section_extraction():
    """Test section extraction from man page content."""
    print("\nTesting section extraction:")
    
    sample_content = """
NAME
       ls - list directory contents

SYNOPSIS
       ls [OPTION]... [FILE]...

DESCRIPTION
       List information about the FILEs (the current directory by default).
       Sort entries alphabetically if none of -cftuvSUX nor --sort is specified.

OPTIONS
       -a, --all
              do not ignore entries starting with .

       -l     use a long listing format

EXAMPLES
       ls -la /home
              List all files in /home with details

       ls *.txt
              List all text files

SEE ALSO
       dir(1), vdir(1), dircolors(1), sort(1)
"""
    
    extractor = ManPageExtractor("sqlite:///test.db")
    result = extractor.extract_sections(sample_content)
    
    print(f"  ✓ Title: {result['title']}")
    print(f"  ✓ Description: {result['description']}")
    print(f"  ✓ Sections: {[s['name'] for s in result['sections']]}")
    print(f"  ✓ Options: {len(result['options'])} options extracted")
    for opt in result['options']:
        print(f"    - {opt['flag']}: {opt['description'][:50]}...")
    print(f"  ✓ Examples: {len(result['examples'])} examples extracted")
    for ex in result['examples']:
        print(f"    - {ex['command']}")
    print(f"  ✓ See Also: {result['see_also']}")


async def test_database_storage():
    """Test storing to database."""
    print("\nTesting database storage:")
    
    # Use SQLite for testing
    db_url = "sqlite:///test_extractor.db"
    
    # Clean up existing test database
    if os.path.exists("test_extractor.db"):
        os.remove("test_extractor.db")
    
    # Create tables
    from sqlalchemy import create_engine, text
    engine = create_engine(db_url)
    
    # Create simplified test table
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS man_pages (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                section TEXT NOT NULL,
                title TEXT,
                description TEXT,
                synopsis TEXT,
                content TEXT,
                category TEXT,
                related_commands TEXT,
                meta_data TEXT,
                is_common INTEGER DEFAULT 0,
                view_count INTEGER DEFAULT 0,
                cache_priority INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP,
                search_vector TEXT,
                UNIQUE(name, section)
            )
        """))
        conn.commit()
    
    extractor = ManPageExtractor(db_url)
    
    # Parse a test command
    test_page = extractor.parse_man_page('ls', '1')
    
    if test_page:
        # Store to database
        await extractor.store_to_database([test_page])
        
        # Verify storage
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT * FROM man_pages WHERE name = :name"),
                {"name": "ls"}
            ).first()
            
            if result:
                print(f"  ✓ Page stored successfully")
                print(f"    - Name: {result.name}")
                print(f"    - Section: {result.section}")
                print(f"    - Category: {result.category}")
            else:
                print(f"  ✗ Page not found in database")
    
    # Clean up
    os.remove("test_extractor.db")


def main():
    """Run all tests."""
    print("=" * 60)
    print("Man Page Extractor Test Suite")
    print("=" * 60)
    
    test_categorization()
    test_section_extraction()
    test_man_page_parsing()
    
    # Run async test
    asyncio.run(test_database_storage())
    
    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()