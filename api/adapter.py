"""
FastAPI to Vercel adapter
"""
import os
import sys
import json
from typing import Dict, Any
from mangum import Mangum

# Add backend to path
backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Import the FastAPI app
try:
    from src.main import app
    # Create the handler for Vercel
    handler = Mangum(app)
except ImportError as e:
    # Fallback handler if backend is not available
    def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
        return {
            "statusCode": 503,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "error": "Backend service unavailable",
                "details": str(e)
            })
        }