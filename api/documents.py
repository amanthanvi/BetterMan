"""
Documents endpoint for Vercel - using real man page data
"""
import json
from urllib.parse import urlparse
try:
    from .manpage_loader import load_manpage_metadata, load_manpage_content
except ImportError:
    from manpage_loader import load_manpage_metadata, load_manpage_content

# Cache for performance
_manpages_cache = None

def get_all_manpages():
    """Get all man pages with caching"""
    global _manpages_cache
    if _manpages_cache is None:
        _manpages_cache = load_manpage_metadata()
    return _manpages_cache

def handler(request):
    """Vercel serverless function handler"""
    
    # CORS headers
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
    
    # Handle OPTIONS request
    if request.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    # Parse the path
    path = request.path
    path_parts = path.strip('/').split('/')
    
    try:
        # Handle /api/documents/:id
        if len(path_parts) >= 3 and path_parts[0] == 'api' and path_parts[1] == 'documents':
            doc_id = path_parts[2]
            
            # Try to parse command and section from ID (e.g., "ls.1" or just "ls")
            if '.' in doc_id:
                command, section = doc_id.rsplit('.', 1)
            else:
                command, section = doc_id, "1"
            
            # Load metadata
            manpages = get_all_manpages()
            doc_meta = next((p for p in manpages if p.get('command') == command and p.get('section') == section), None)
            
            if not doc_meta:
                # Try without section
                doc_meta = next((p for p in manpages if p.get('command') == command), None)
                if doc_meta:
                    section = doc_meta.get('section', '1')
            
            if doc_meta:
                # Load content
                content = load_manpage_content(command, section)
                
                response = {
                    'id': doc_id,
                    'command': command,
                    'title': f"{command} - {doc_meta.get('brief', 'manual page')}",
                    'description': doc_meta.get('brief', ''),
                    'section': section,
                    'category': doc_meta.get('category', 'general'),
                    'tags': doc_meta.get('tags', '').split(',') if doc_meta.get('tags') else [],
                    'content': content or f"Content not available for {command}({section})",
                    'priority': doc_meta.get('priority', 0),
                    'package_hint': doc_meta.get('package_hint', '')
                }
            else:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'error': 'Document not found'})
                }
        else:
            # List all documents
            manpages = get_all_manpages()
            
            # Convert to API format
            documents = []
            for page in manpages[:100]:  # Limit to 100 for performance
                documents.append({
                    'id': f"{page.get('command')}.{page.get('section', '1')}",
                    'command': page.get('command', ''),
                    'title': f"{page.get('command')} - {page.get('brief', '')}",
                    'description': page.get('brief', ''),
                    'section': page.get('section', '1'),
                    'category': page.get('category', 'general'),
                    'tags': page.get('tags', '').split(',') if page.get('tags') else [],
                    'popularity_score': page.get('priority', 0) * 10
                })
            
            # Sort by popularity/priority
            documents.sort(key=lambda x: x['popularity_score'], reverse=True)
            
            response = {
                'documents': documents,
                'total': len(manpages),
                'page': 1,
                'per_page': 100
            }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(response)
        }
    
    except Exception as e:
        # Fall back to mock data on error
        mock_response = {
            'documents': [
                {
                    'id': 'ls',
                    'command': 'ls',
                    'title': 'ls - list directory contents',
                    'description': 'List information about the FILEs',
                    'section': '1',
                    'category': 'file-management',
                    'tags': ['file', 'directory', 'list'],
                    'popularity_score': 95
                }
            ],
            'total': 1,
            'error': str(e)
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(mock_response)
        }