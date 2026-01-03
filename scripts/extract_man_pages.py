#!/usr/bin/env python3
"""Extract man pages from Ubuntu system"""

import subprocess
import json
import re
from pathlib import Path

def extract_all_man_pages():
    """Extract all available man pages"""
    
    # Get list of all man pages
    result = subprocess.run(['apropos', '.'], capture_output=True, text=True)
    man_pages = []
    
    for line in result.stdout.split('\n'):
        if line:
            match = re.match(r'^(\S+)\s*\((\d)\)', line)
            if match:
                man_pages.append((match.group(1), match.group(2)))
    
    print(f"Found {len(man_pages)} man pages")
    
    extracted = []
    for name, section in man_pages[:100]:  # Limit for testing
        try:
            # Get man page content
            result = subprocess.run(
                ['man', section, name],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                extracted.append({
                    'name': name,
                    'section': int(section),
                    'content': result.stdout
                })
                print(f"✓ {name}({section})")
        except Exception as e:
            print(f"✗ {name}({section}): {e}")
    
    # Save to JSON
    output_dir = Path('data')
    output_dir.mkdir(exist_ok=True)
    
    with open(output_dir / 'man_pages.json', 'w') as f:
        json.dump(extracted, f, indent=2)
    
    print(f"\n✅ Extracted {len(extracted)} man pages")

if __name__ == "__main__":
    extract_all_man_pages()
