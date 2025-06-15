from http.server import BaseHTTPRequestHandler
import json
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        # Simple health check
        if self.path == '/api/health':
            self.wfile.write(json.dumps({
                'status': 'healthy',
                'message': 'BetterMan API is running'
            }).encode())
            return
            
        # Default response
        self.wfile.write(json.dumps({
            'message': 'BetterMan API',
            'endpoints': ['/api/health', '/api/documents']
        }).encode())
        
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()