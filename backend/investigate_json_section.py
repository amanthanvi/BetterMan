#!/usr/bin/env python3
"""Investigate the origin of section='json' documents."""

import sqlite3
import json

# Connect to the database
db_path = '../data/betterman.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check the content and raw_content of a few 'json' section documents
print("=== Investigating content of 'json' section documents ===")
cursor.execute("""
    SELECT name, section, content, raw_content, file_path, meta_info
    FROM documents 
    WHERE section = 'json'
    LIMIT 5
""")

results = cursor.fetchall()
for row in results:
    name, section, content, raw_content, file_path, meta_info = row
    print(f"\n--- Document: {name} (section={section}) ---")
    print(f"File path: {file_path}")
    
    # Check if content is JSON
    if content:
        try:
            parsed = json.loads(content)
            print(f"Content is valid JSON with keys: {list(parsed.keys())[:5]}...")
            if 'sections' in parsed:
                print(f"  Has {len(parsed['sections'])} sections")
        except:
            print(f"Content is not JSON, first 200 chars: {content[:200]}...")
    else:
        print("Content is NULL")
    
    # Check raw content
    if raw_content:
        print(f"Raw content first 200 chars: {raw_content[:200]}...")
    else:
        print("Raw content is NULL")
        
    # Check meta_info
    if meta_info:
        try:
            meta = json.loads(meta_info) if isinstance(meta_info, str) else meta_info
            print(f"Meta info: {meta}")
        except:
            print(f"Meta info (raw): {meta_info}")
    else:
        print("Meta info is NULL")

# Look at the creation pattern
print("\n\n=== Creation time patterns ===")
cursor.execute("""
    SELECT 
        DATE(created_at) as creation_date,
        section,
        COUNT(*) as count
    FROM documents
    WHERE section IN ('json', '1', '2', '3')
    GROUP BY creation_date, section
    ORDER BY creation_date DESC, section
""")

patterns = cursor.fetchall()
for row in patterns:
    print(f"  {row[0]} | section={row[1]} | count={row[2]}")

# Check for any loading scripts or migrations that might have created these
print("\n\n=== Checking for patterns in file paths ===")
cursor.execute("""
    SELECT DISTINCT file_path
    FROM documents
    WHERE section = 'json' AND file_path IS NOT NULL
    LIMIT 10
""")

paths = cursor.fetchall()
for row in paths:
    print(f"  {row[0]}")

conn.close()