#!/usr/bin/env python3
"""
Find the script that loaded JSON metadata files as documents.
"""

import os
import sqlite3
import json
from datetime import datetime

# Connect to the database
db_path = '../data/betterman.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check creation timestamps
print("=== Checking creation times ===")
cursor.execute("""
    SELECT 
        DATE(created_at) as date,
        TIME(created_at) as time,
        COUNT(*) as count
    FROM documents
    WHERE section = 'json'
    GROUP BY DATE(created_at), TIME(created_at)
    ORDER BY created_at
    LIMIT 10
""")

times = cursor.fetchall()
for date, time, count in times:
    print(f"{date} {time}: {count} JSON documents created")

# Check if all JSON documents have the same creation timestamp
cursor.execute("""
    SELECT MIN(created_at), MAX(created_at)
    FROM documents
    WHERE section = 'json'
""")

min_time, max_time = cursor.fetchone()
print(f"\nJSON documents created between {min_time} and {max_time}")

# Look for any script that might have loaded these
print("\n=== Potential loader scripts ===")

# Search for Python files that might load JSON files
for root, dirs, files in os.walk('..'):
    # Skip virtual environments and cache
    dirs[:] = [d for d in dirs if d not in {'venv', '__pycache__', '.git', 'node_modules'}]
    
    for file in files:
        if file.endswith('.py'):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    # Look for patterns that might load JSON files as documents
                    if any(pattern in content for pattern in [
                        'section="json"',
                        "section='json'",
                        'section = "json"',
                        "section = 'json'",
                        '.json" and section',
                        "generated_manpages",
                        "json_data.get('command')",
                        "metadata.get('command')"
                    ]):
                        print(f"  Potential match: {filepath}")
            except:
                pass

# Check the raw_content of a JSON document to see if it matches file content
print("\n=== Checking raw_content format ===")
cursor.execute("""
    SELECT raw_content
    FROM documents
    WHERE section = 'json'
    LIMIT 1
""")

raw = cursor.fetchone()[0]
if raw:
    try:
        # If raw_content is valid JSON, it's likely the JSON file was loaded directly
        parsed = json.loads(raw)
        print("Raw content is valid JSON - confirms JSON files were loaded as documents")
        print(f"Keys in raw content: {list(parsed.keys())}")
    except:
        print("Raw content is not JSON")

conn.close()