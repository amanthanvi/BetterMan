"""
Analytics endpoint for Vercel
"""
from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urlparse(self.path)
        path_parts = parsed_url.path.strip('/').split('/')
        
        # Set CORS headers
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        
        # Handle different analytics endpoints
        if len(path_parts) >= 3 and path_parts[2] == 'popular':
            # /api/analytics/popular
            response = {
                "commands": [
                    {
                        "id": "ls",
                        "name": "ls",
                        "summary": "List directory contents",
                        "view_count": 1250,
                        "unique_users": 450,
                        "section": "1",
                        "trend": "up"
                    },
                    {
                        "id": "grep",
                        "name": "grep",
                        "summary": "Search text patterns in files",
                        "view_count": 980,
                        "unique_users": 380,
                        "section": "1",
                        "trend": "up"
                    },
                    {
                        "id": "cd",
                        "name": "cd",
                        "summary": "Change directory",
                        "view_count": 890,
                        "unique_users": 420,
                        "section": "1",
                        "trend": "stable"
                    },
                    {
                        "id": "find",
                        "name": "find",
                        "summary": "Search for files and directories",
                        "view_count": 650,
                        "unique_users": 280,
                        "section": "1",
                        "trend": "up"
                    },
                    {
                        "id": "awk",
                        "name": "awk",
                        "summary": "Pattern scanning and processing language",
                        "view_count": 520,
                        "unique_users": 180,
                        "section": "1",
                        "trend": "down"
                    },
                    {
                        "id": "sed",
                        "name": "sed",
                        "summary": "Stream editor for filtering and transforming text",
                        "view_count": 480,
                        "unique_users": 160,
                        "section": "1",
                        "trend": "stable"
                    }
                ]
            }
        elif len(path_parts) >= 3 and path_parts[2] == 'overview':
            # /api/analytics/overview
            response = {
                "total_documents": 8400,
                "total_searches": 15420,
                "avg_response_time": 45,
                "total_page_views": 32500,
                "active_users": 1250,
                "popular_categories": [
                    {"name": "file-management", "count": 3200},
                    {"name": "text-processing", "count": 2800},
                    {"name": "network", "count": 1500}
                ],
                "search_trends": [
                    {"date": "2025-01-09", "count": 2100},
                    {"date": "2025-01-10", "count": 2200},
                    {"date": "2025-01-11", "count": 2150},
                    {"date": "2025-01-12", "count": 2300},
                    {"date": "2025-01-13", "count": 2400},
                    {"date": "2025-01-14", "count": 2120},
                    {"date": "2025-01-15", "count": 2150}
                ]
            }
        else:
            # Default analytics response
            response = {
                "status": "ok",
                "endpoints": [
                    "/api/analytics/overview",
                    "/api/analytics/popular"
                ]
            }
        
        self.wfile.write(json.dumps(response).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()