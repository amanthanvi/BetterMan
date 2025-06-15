"""
Utility to load real man page data for Vercel functions
"""
import json
import os
from pathlib import Path

def get_backend_path():
    """Get the backend directory path"""
    return Path(__file__).parent.parent / "backend"

def load_manpage_metadata():
    """Load all man page metadata from generated_manpages"""
    manpages = []
    backend_path = get_backend_path()
    generated_path = backend_path / "generated_manpages"
    
    if not generated_path.exists():
        return []
    
    for section_dir in generated_path.iterdir():
        if section_dir.is_dir() and section_dir.name.startswith('man'):
            for json_file in section_dir.glob('*.json'):
                try:
                    with open(json_file, 'r') as f:
                        data = json.load(f)
                        # Add file path info
                        data['id'] = json_file.stem.split('.')[0]
                        data['json_path'] = str(json_file)
                        manpages.append(data)
                except Exception:
                    continue
    
    return manpages

def load_manpage_content(command, section="1"):
    """Load the actual content of a man page"""
    backend_path = get_backend_path()
    
    # Try to load the plain text version
    plain_path = backend_path / "extracted_manpages" / f"{command}.{section}.plain"
    if plain_path.exists():
        try:
            with open(plain_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            pass
    
    # Try formatted version
    formatted_path = backend_path / "extracted_manpages" / f"{command}.{section}.formatted"
    if formatted_path.exists():
        try:
            with open(formatted_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            pass
    
    return None

def search_manpages(query):
    """Search man pages by command name or description"""
    manpages = load_manpage_metadata()
    query_lower = query.lower()
    
    results = []
    for page in manpages:
        score = 0
        command = page.get('command', '').lower()
        brief = page.get('brief', '').lower()
        
        # Exact command match
        if command == query_lower:
            score = 100
        # Command starts with query
        elif command.startswith(query_lower):
            score = 80
        # Command contains query
        elif query_lower in command:
            score = 60
        # Brief contains query
        elif query_lower in brief:
            score = 40
        
        if score > 0:
            page['score'] = score
            results.append(page)
    
    # Sort by score
    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:20]  # Return top 20 results