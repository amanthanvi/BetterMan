"""
Documents endpoint for Vercel
"""
from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
import re

# Sample man pages data
SAMPLE_DOCUMENTS = [
    {
        "id": "ls",
        "command": "ls",
        "title": "ls - list directory contents",
        "description": "List information about the FILEs (the current directory by default).",
        "section": "1",
        "category": "file-management",
        "tags": ["file", "directory", "list"],
        "popularity_score": 95,
        "content": """NAME
       ls - list directory contents

SYNOPSIS
       ls [OPTION]... [FILE]...

DESCRIPTION
       List information about the FILEs (the current directory by default).
       Sort entries alphabetically if none of -cftuvSUX nor --sort is specified.

       Mandatory arguments to long options are mandatory for short options too.

       -a, --all
              do not ignore entries starting with .

       -l     use a long listing format

       -h, --human-readable
              with -l and -s, print sizes like 1K 234M 2G etc."""
    },
    {
        "id": "grep",
        "command": "grep",
        "title": "grep - print lines that match patterns",
        "description": "Search for PATTERNS in each FILE.",
        "section": "1",
        "category": "text-processing",
        "tags": ["search", "text", "pattern"],
        "popularity_score": 90,
        "content": """NAME
       grep - print lines that match patterns

SYNOPSIS
       grep [OPTION]... PATTERNS [FILE]...

DESCRIPTION
       grep searches for PATTERNS in each FILE.
       PATTERNS is one or more patterns separated by newline characters, and grep prints each line that matches a pattern.

       -i, --ignore-case
              Ignore case distinctions in patterns and input data.

       -r, --recursive
              Read all files under each directory, recursively."""
    },
    {
        "id": "cd",
        "command": "cd",
        "title": "cd - change directory",
        "description": "Change the shell working directory.",
        "section": "1",
        "category": "navigation",
        "tags": ["directory", "navigation"],
        "popularity_score": 98,
        "content": """NAME
       cd - change directory

SYNOPSIS
       cd [DIRECTORY]

DESCRIPTION
       Change the current directory to DIRECTORY.
       If DIRECTORY is not supplied, the value of the HOME environment variable is used."""
    }
]

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)
        path_parts = parsed_path.path.strip('/').split('/')
        
        # Set CORS headers
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        
        # Handle /api/documents/:id
        if len(path_parts) >= 3 and path_parts[0] == 'api' and path_parts[1] == 'documents':
            doc_id = path_parts[2]
            doc = next((d for d in SAMPLE_DOCUMENTS if d['id'] == doc_id), None)
            if doc:
                self.wfile.write(json.dumps(doc).encode())
            else:
                self.send_response(404)
                self.wfile.write(json.dumps({'error': 'Document not found'}).encode())
        else:
            # List all documents
            response = {
                'documents': SAMPLE_DOCUMENTS,
                'total': len(SAMPLE_DOCUMENTS),
                'page': 1,
                'per_page': 20
            }
            self.wfile.write(json.dumps(response).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()