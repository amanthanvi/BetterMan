"""
Search endpoint for Vercel
"""
from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs

# Import sample documents from documents module
SAMPLE_DOCUMENTS = [
    {
        "id": "ls",
        "command": "ls",
        "title": "ls - list directory contents",
        "description": "List information about the FILEs (the current directory by default).",
        "section": "1",
        "category": "file-management",
        "tags": ["file", "directory", "list"],
        "popularity_score": 95
    },
    {
        "id": "grep",
        "command": "grep",
        "title": "grep - print lines that match patterns",
        "description": "Search for PATTERNS in each FILE.",
        "section": "1",
        "category": "text-processing",
        "tags": ["search", "text", "pattern"],
        "popularity_score": 90
    },
    {
        "id": "cd",
        "command": "cd",
        "title": "cd - change directory",
        "description": "Change the shell working directory.",
        "section": "1",
        "category": "navigation",
        "tags": ["directory", "navigation"],
        "popularity_score": 98
    }
]

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)
        
        # Get search query
        query = query_params.get('q', [''])[0].lower()
        
        # Set CORS headers
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        
        # Filter documents based on query
        if query:
            results = [
                doc for doc in SAMPLE_DOCUMENTS
                if query in doc['command'].lower() or
                   query in doc['title'].lower() or
                   query in doc['description'].lower() or
                   any(query in tag for tag in doc['tags'])
            ]
        else:
            results = SAMPLE_DOCUMENTS
        
        # Sort by popularity
        results.sort(key=lambda x: x['popularity_score'], reverse=True)
        
        response = {
            'results': results,
            'query': query,
            'total': len(results),
            'suggestions': []
        }
        
        self.wfile.write(json.dumps(response).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()