#!/usr/bin/env python3
"""Check for documents with section='json' in the database."""

import sqlite3
import json
from collections import Counter

# Connect to the database
db_path = '../data/betterman.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check for documents with section='json'
print("=== Documents with section='json' ===")
cursor.execute("""
    SELECT name, section, title, cache_status, tags, created_at
    FROM documents 
    WHERE section = 'json'
    ORDER BY created_at DESC
    LIMIT 20
""")

results = cursor.fetchall()
print(f"Found {len(results)} documents with section='json'")
for row in results:
    print(f"  {row[0]} | section={row[1]} | title={row[2]} | cache_status={row[3]} | tags={row[4]} | created={row[5]}")

# Check for duplicate names across different sections
print("\n=== Duplicate document names across sections ===")
cursor.execute("""
    SELECT name, GROUP_CONCAT(section) as sections, COUNT(*) as count
    FROM documents
    GROUP BY name
    HAVING count > 1
    ORDER BY count DESC
    LIMIT 20
""")

duplicates = cursor.fetchall()
print(f"Found {len(duplicates)} documents with multiple sections")
for row in duplicates:
    print(f"  {row[0]} | sections: {row[1]} | count: {row[2]}")

# Check all unique sections
print("\n=== All unique sections ===")
cursor.execute("""
    SELECT section, COUNT(*) as count
    FROM documents
    GROUP BY section
    ORDER BY count DESC
""")

sections = cursor.fetchall()
for row in sections:
    print(f"  Section '{row[0]}': {row[1]} documents")

# Check for patterns in tags
print("\n=== Checking tags for 'json' documents ===")
cursor.execute("""
    SELECT DISTINCT tags
    FROM documents
    WHERE section = 'json' AND tags IS NOT NULL
    LIMIT 10
""")

tags = cursor.fetchall()
for row in tags:
    print(f"  Tags: {row[0]}")

conn.close()