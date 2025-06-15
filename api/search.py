"""
Search endpoint for Vercel - using real man page data
"""
import json
from urllib.parse import parse_qs
try:
    from .manpage_loader import search_manpages
except ImportError:
    from manpage_loader import search_manpages

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
    
    # Get query parameters
    query_params = parse_qs(request.query)
    query = query_params.get('q', [''])[0]
    
    try:
        # Search using real data
        if query:
            results = search_manpages(query)
            
            # Convert to API format
            formatted_results = []
            for result in results:
                formatted_results.append({
                    'id': f"{result.get('command')}.{result.get('section', '1')}",
                    'command': result.get('command', ''),
                    'title': f"{result.get('command')} - {result.get('brief', '')}",
                    'description': result.get('brief', ''),
                    'section': result.get('section', '1'),
                    'category': result.get('category', 'general'),
                    'tags': result.get('tags', '').split(',') if result.get('tags') else [],
                    'popularity_score': result.get('score', 0)
                })
        else:
            # Return popular commands when no query
            try:
                from .manpage_loader import load_manpage_metadata
            except ImportError:
                from manpage_loader import load_manpage_metadata
                
            all_pages = load_manpage_metadata()
            # Sort by priority and take top 10
            all_pages.sort(key=lambda x: x.get('priority', 0), reverse=True)
            
            formatted_results = []
            for page in all_pages[:10]:
                formatted_results.append({
                    'id': f"{page.get('command')}.{page.get('section', '1')}",
                    'command': page.get('command', ''),
                    'title': f"{page.get('command')} - {page.get('brief', '')}",
                    'description': page.get('brief', ''),
                    'section': page.get('section', '1'),
                    'category': page.get('category', 'general'),
                    'tags': page.get('tags', '').split(',') if page.get('tags') else [],
                    'popularity_score': page.get('priority', 0) * 10
                })
        
        response = {
            'results': formatted_results,
            'query': query,
            'total': len(formatted_results),
            'suggestions': []
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(response)
        }
    
    except Exception as e:
        # Fallback to mock data on error
        mock_response = {
            'results': [
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
            'query': query,
            'total': 1,
            'error': str(e)
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(mock_response)
        }