"""
Health check endpoint for Vercel
"""
import json

def handler(request, context):
    """Vercel serverless function handler"""
    
    # CORS headers
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
    
    # Handle OPTIONS request
    if request.get('method', 'GET') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    response = {
        'status': 'ok',
        'message': 'BetterMan API is running',
        'environment': 'vercel',
        'components': {
            'database': 'simulated',
            'cache': 'not configured',
            'search': 'fallback mode'
        }
    }
    
    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps(response)
    }