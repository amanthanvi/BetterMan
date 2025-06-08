#!/usr/bin/env python3
"""Analyze the JSON documents to understand their structure."""

import sqlite3
import json

# Connect to the database
db_path = '../data/betterman.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get a JSON document that also has a proper section equivalent
print("=== Comparing JSON vs proper section documents ===")
cursor.execute("""
    SELECT d1.name, d1.section as json_section, d1.content as json_content, 
           d2.section as proper_section, d2.content as proper_content
    FROM documents d1
    JOIN documents d2 ON d1.name = d2.name
    WHERE d1.section = 'json' AND d2.section != 'json'
    LIMIT 3
""")

comparisons = cursor.fetchall()
for name, json_section, json_content, proper_section, proper_content in comparisons:
    print(f"\n--- Command: {name} ---")
    print(f"JSON document section: {json_section}")
    print(f"Proper document section: {proper_section}")
    
    # Parse JSON content
    if json_content:
        try:
            json_data = json.loads(json_content)
            print(f"JSON content keys: {list(json_data.keys())}")
            if 'section' in json_data:
                print(f"  Section in JSON data: {json_data['section']}")
            if 'command' in json_data:
                print(f"  Command in JSON data: {json_data['command']}")
        except:
            print("  Failed to parse JSON content")
    
    # Check proper content
    if proper_content:
        try:
            proper_data = json.loads(proper_content)
            print(f"Proper content has sections: {'sections' in proper_data}")
        except:
            print("  Proper content is not JSON")

# Now check if these JSON documents might be metadata files that were accidentally loaded
print("\n\n=== Checking if JSON documents match metadata format ===")
cursor.execute("""
    SELECT content, raw_content
    FROM documents
    WHERE section = 'json'
    LIMIT 1
""")

content, raw_content = cursor.fetchone()
if content:
    try:
        data = json.loads(content)
        print("JSON document structure:")
        for key, value in data.items():
            if isinstance(value, (str, int, float)):
                print(f"  {key}: {value}")
            else:
                print(f"  {key}: {type(value).__name__}")
                
        # Compare with expected metadata format
        metadata_keys = {'command', 'section', 'priority', 'category', 'tags', 'brief', 'generated_at'}
        doc_keys = set(data.keys())
        
        if metadata_keys.issubset(doc_keys):
            print("\n⚠️  This looks like a metadata file, not a man page!")
            print("The 'json' documents appear to be metadata files that were loaded as documents.")
    except:
        pass

conn.close()