"""
Vercel serverless function handler for BetterMan API
"""
import os
import sys
from pathlib import Path

# Add backend to Python path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

# Import FastAPI app
try:
    from src.main import app
    from mangum import Mangum
    
    # Create the handler for Vercel
    handler = Mangum(app)
except ImportError as e:
    # Fallback handler if imports fail
    def handler(event, context):
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": f"Failed to import FastAPI app: {str(e)}"
        }