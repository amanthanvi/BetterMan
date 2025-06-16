#!/usr/bin/env python3
"""
Parse groff man page files and extract structured content.
"""

import re
from typing import Dict, List

def parse_groff_man_page(content: str) -> Dict:
    """Parse a groff-formatted man page."""
    lines = content.split('\n')
    
    # Initialize result
    result = {
        'title': '',
        'sections': [],
        'metadata': {}
    }
    
    # State tracking
    current_section = None
    current_content = []
    in_section = False
    
    for line in lines:
        # Skip empty lines at the beginning
        if not line.strip() and not current_section:
            continue
            
        # Handle .TH (title header)
        if line.startswith('.TH '):
            parts = line.split(' ', 4)
            if len(parts) >= 3:
                result['metadata']['command'] = parts[1]
                result['metadata']['section'] = parts[2]
                if len(parts) >= 4:
                    result['metadata']['date'] = parts[3].strip('"')
                if len(parts) >= 5:
                    result['metadata']['source'] = parts[4].strip('"')
        
        # Handle .SH (section header)
        elif line.startswith('.SH '):
            # Save previous section
            if current_section:
                result['sections'].append({
                    'name': current_section,
                    'content': clean_groff_content('\n'.join(current_content))
                })
            
            # Start new section
            current_section = line[4:].strip()
            current_content = []
            in_section = True
            
        # Handle other groff commands
        elif line.startswith('.'):
            # Keep some formatting commands in content
            if any(line.startswith(cmd) for cmd in ['.TP', '.PP', '.BR', '.B', '.I']):
                current_content.append(line)
        
        # Regular content
        elif in_section:
            current_content.append(line)
    
    # Don't forget the last section
    if current_section:
        result['sections'].append({
            'name': current_section,
            'content': clean_groff_content('\n'.join(current_content))
        })
    
    # Extract title from NAME section
    for section in result['sections']:
        if section['name'] == 'NAME':
            # Format: command - description
            name_content = section['content']
            if ' - ' in name_content:
                result['title'] = name_content.strip()
            elif '\\-' in name_content:
                result['title'] = name_content.replace('\\-', '-').strip()
            break
    
    return result

def clean_groff_content(content: str) -> str:
    """Clean groff formatting from content while preserving structure."""
    # Remove escape sequences
    content = content.replace('\\-', '-')
    content = content.replace('\\ ', ' ')
    content = content.replace('\\fB', '')
    content = content.replace('\\fR', '')
    content = content.replace('\\fI', '')
    content = content.replace('\\fP', '')
    content = content.replace('\\(co', '©')
    
    # Clean up formatting commands but preserve structure
    lines = content.split('\n')
    cleaned_lines = []
    
    for line in lines:
        if line.startswith('.TP'):
            cleaned_lines.append('')  # Add blank line for separation
        elif line.startswith('.PP'):
            cleaned_lines.append('')
        elif line.startswith('.BR '):
            # Format: .BR command (section)
            cleaned_lines.append(line[4:].replace(',', ''))
        elif line.startswith('.B '):
            cleaned_lines.append(line[3:])
        elif line.startswith('.I '):
            cleaned_lines.append(line[3:])
        elif not line.startswith('.'):
            cleaned_lines.append(line)
    
    return '\n'.join(cleaned_lines).strip()

# Test the parser
if __name__ == '__main__':
    import sys
    
    # Test with ls.1
    with open('generated_manpages/man1/ls.1', 'r') as f:
        content = f.read()
    
    parsed = parse_groff_man_page(content)
    
    print(f"Title: {parsed['title']}")
    print(f"Metadata: {parsed['metadata']}")
    print(f"\nSections ({len(parsed['sections'])}):")
    for section in parsed['sections']:
        print(f"\n{section['name']}:")
        print(section['content'][:200] + '...' if len(section['content']) > 200 else section['content'])