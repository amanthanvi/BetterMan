#!/usr/bin/env python3
"""
Parse man pages and store them in SQLite database
"""
import sqlite3
import json
import os
import subprocess
from datetime import datetime
from pathlib import Path
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.parser.enhanced_groff_parser import EnhancedGroffManPageParser

DATABASE_PATH = os.getenv('DATABASE_PATH', '/data/betterman.db')

def get_all_man_pages():
    """Get list of all available man pages on the system"""
    try:
        result = subprocess.run(
            ["man", "-k", "."],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            print(f"⚠️  Failed to get man page list: {result.stderr}")
            return []
        
        pages = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            
            # Parse format: "command (section) - description"
            parts = line.split(' - ', 1)
            if len(parts) < 2:
                continue
            
            name_section = parts[0].strip()
            # Extract name and section
            if '(' in name_section and ')' in name_section:
                name = name_section.split('(')[0].strip()
                section = name_section.split('(')[1].split(')')[0].strip()
                try:
                    section_num = int(section)
                    pages.append((name, section_num))
                except ValueError:
                    continue
        
        return pages
    except Exception as e:
        print(f"❌ Error getting man pages: {e}")
        return []

def parse_and_store_man_page(conn, name, section):
    """Parse a single man page and store in database"""
    parser = EnhancedGroffManPageParser()
    
    try:
        # Parse the man page
        parsed = parser.parse(name, section)
        
        if not parsed:
            return False
        
        # Convert lists to JSON for storage
        keywords_json = json.dumps(parsed.get('keywords', []))
        see_also_json = json.dumps(parsed.get('see_also', []))
        related_json = json.dumps(parsed.get('related_commands', []))
        examples_json = json.dumps(parsed.get('examples', []))
        options_json = json.dumps(parsed.get('options', []))
        
        # Insert or update in database
        conn.execute("""
            INSERT OR REPLACE INTO man_pages (
                name, section, title, description, synopsis, content,
                category, is_common, complexity, keywords, see_also,
                related_commands, examples, options, author, source,
                manual, parsed_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            parsed['name'],
            parsed['section'],
            parsed['title'],
            parsed['description'],
            parsed.get('synopsis', ''),
            parsed.get('raw_content', ''),
            parsed.get('category', 'User Commands'),
            parsed.get('is_common', False),
            parsed.get('complexity', 'intermediate'),
            keywords_json,
            see_also_json,
            related_json,
            examples_json,
            options_json,
            parsed.get('author', ''),
            parsed.get('source', ''),
            parsed.get('manual', ''),
            datetime.now(),
            datetime.now()
        ))
        
        return True
    except Exception as e:
        print(f"❌ Error parsing {name}({section}): {e}")
        return False

def main():
    """Main function to parse all man pages"""
    print("🚀 Starting man page parsing to SQLite...")
    
    # Ensure database exists
    if not Path(DATABASE_PATH).exists():
        print("📦 Creating database...")
        from setup_sqlite import create_database
        create_database()
    
    # Connect to database
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    
    # Get all available man pages
    print("📋 Getting list of man pages...")
    pages = get_all_man_pages()
    print(f"📊 Found {len(pages)} man pages")
    
    # Parse and store each page
    success_count = 0
    for i, (name, section) in enumerate(pages):
        if i % 10 == 0:
            print(f"Progress: {i}/{len(pages)} ({i*100//len(pages)}%)")
        
        if parse_and_store_man_page(conn, name, section):
            success_count += 1
        
        # Commit every 50 pages
        if i % 50 == 0:
            conn.commit()
    
    # Final commit
    conn.commit()
    
    # Print statistics
    cursor = conn.execute("SELECT COUNT(*) as count FROM man_pages")
    total_stored = cursor.fetchone()['count']
    
    print(f"\n✅ Parsing complete!")
    print(f"📊 Successfully parsed: {success_count}/{len(pages)}")
    print(f"💾 Total pages in database: {total_stored}")
    
    # Optimize database
    print("🔧 Optimizing database...")
    conn.execute("VACUUM")
    conn.execute("ANALYZE")
    
    conn.close()
    print("✨ Done!")

if __name__ == "__main__":
    main()