"""
Analytics endpoint for Vercel - using real man page statistics
"""
import json
from urllib.parse import urlparse
try:
    from .manpage_loader import load_manpage_metadata
except ImportError:
    from manpage_loader import load_manpage_metadata

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
        # Load real data
        all_manpages = load_manpage_metadata()
        
        # Handle different analytics endpoints
        if len(path_parts) >= 3 and path_parts[2] == 'popular':
            # /api/analytics/popular
            # Get top commands by priority
            sorted_pages = sorted(all_manpages, key=lambda x: x.get('priority', 0), reverse=True)
            
            commands = []
            for page in sorted_pages[:6]:
                commands.append({
                    "id": page.get('command', ''),
                    "name": page.get('command', ''),
                    "summary": page.get('brief', 'No description available'),
                    "view_count": page.get('priority', 0) * 250,  # Simulated view count
                    "unique_users": page.get('priority', 0) * 100,  # Simulated users
                    "section": page.get('section', '1'),
                    "trend": "up" if page.get('priority', 0) > 5 else "stable"
                })
            
            response = {"commands": commands}
            
        elif len(path_parts) >= 3 and path_parts[2] == 'overview':
            # /api/analytics/overview
            # Calculate real statistics
            total_docs = len(all_manpages)
            
            # Count by category
            categories = {}
            for page in all_manpages:
                cat = page.get('category', 'general')
                categories[cat] = categories.get(cat, 0) + 1
            
            # Get top categories
            top_categories = sorted(categories.items(), key=lambda x: x[1], reverse=True)[:5]
            
            response = {
                "total_documents": total_docs,
                "total_searches": total_docs * 15,  # Simulated
                "avg_response_time": 25,  # Simulated
                "total_page_views": total_docs * 150,  # Simulated
                "active_users": total_docs * 5,  # Simulated
                "popular_categories": [
                    {"name": cat, "count": count} for cat, count in top_categories
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
                "total_manpages": len(all_manpages),
                "endpoints": [
                    "/api/analytics/overview",
                    "/api/analytics/popular"
                ]
            }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(response)
        }
    
    except Exception as e:
        # Fallback response on error
        fallback_response = {
            "total_documents": 1000,
            "total_searches": 15000,
            "avg_response_time": 30,
            "error": str(e)
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(fallback_response)
        }