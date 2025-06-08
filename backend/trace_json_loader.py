#!/usr/bin/env python3
"""
Trace exactly how JSON files got loaded as documents.
"""

import os
import sqlite3
import json
from pathlib import Path

# Check if there's a loading script that iterates over all files
print("=== Looking for file loading patterns ===")

# Search for scripts that might load all files from generated_manpages
search_patterns = [
    "glob('*')",
    "glob('*.*')",
    "iterdir()",
    "listdir",
    "for file in",
    "for filepath in",
    "Document(",
    "section='json'",
    'section="json"',
]

# Check specific directories
dirs_to_check = [
    "../src/db",
    "../src/parser",
    ".."
]

found_scripts = []

for check_dir in dirs_to_check:
    if not os.path.exists(check_dir):
        continue
        
    for root, dirs, files in os.walk(check_dir):
        # Skip certain directories
        dirs[:] = [d for d in dirs if d not in {'venv', '__pycache__', '.git', 'node_modules', 'tests'}]
        
        for file in files:
            if file.endswith('.py') and not file.startswith(('check_', 'investigate_', 'fix_', 'find_', 'analyze_', 'trace_')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        
                        # Check if this file might load generated_manpages
                        if 'generated_manpages' in content or 'Document(' in content:
                            # Count how many patterns match
                            matches = sum(1 for pattern in search_patterns if pattern in content)
                            if matches >= 2:  # At least 2 patterns match
                                found_scripts.append((filepath, matches))
                except:
                    pass

# Sort by number of matches
found_scripts.sort(key=lambda x: x[1], reverse=True)

print("\nMost likely loader scripts:")
for script, matches in found_scripts[:10]:
    print(f"  {script} ({matches} pattern matches)")

# Now check if any script loads files without checking extension
print("\n=== Checking for extension-agnostic loading ===")

for script, _ in found_scripts[:5]:
    try:
        with open(script, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
            
        for i, line in enumerate(lines):
            # Look for file iteration without extension check
            if any(pattern in line for pattern in ['for file in', 'for filepath in', 'iterdir()', 'glob(']):
                # Check next few lines for extension filtering
                has_extension_check = False
                for j in range(i, min(i+10, len(lines))):
                    if any(ext in lines[j] for ext in ['.json', 'suffix', 'endswith', '.man', '.gz']):
                        has_extension_check = True
                        break
                
                if not has_extension_check and 'Document(' in ''.join(lines[i:i+20]):
                    print(f"\nPotential issue in {script} around line {i+1}:")
                    print(f"  {lines[i].strip()}")
                    print("  ^ This might load files without checking extension!")
    except:
        pass

# Finally, check if there's a bulk loader that used wrong file extension
print("\n=== Checking for bulk JSON loading ===")

db_path = '../data/betterman.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check if file_path field has .json extension
cursor.execute("""
    SELECT DISTINCT file_path
    FROM documents
    WHERE section = 'json' AND file_path IS NOT NULL
    LIMIT 5
""")

paths = cursor.fetchall()
if paths:
    print("\nFile paths for JSON documents:")
    for path in paths:
        print(f"  {path[0]}")
else:
    print("\nNo file paths found for JSON documents - they might have been loaded from a different source")

conn.close()