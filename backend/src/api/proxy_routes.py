# backend/src/api/proxy_routes.py
"""Proxy routes to bypass browser extension interference."""

from fastapi import APIRouter, Depends, Query, Response, Request
from sqlalchemy.orm import Session
import json
import base64
from typing import Optional

from ..db.session import get_db
from ..search.search_engine import SearchEngine
from ..models.document import Document

router = APIRouter()


@router.get("/proxy/search")
async def proxy_search(
    request: Request,
    q: str = Query(..., min_length=2),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    section: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Proxy endpoint for search that returns base64-encoded JSON.
    This bypasses browser extension interference.
    """
    # Create search engine instance
    search_engine = SearchEngine(db)
    
    # Perform search using the search engine
    results = search_engine.search(
        query=q,
        section=section,
        page=page,
        per_page=per_page
    )
    
    # Add page information for compatibility
    results['page'] = page
    results['per_page'] = per_page
    results['query'] = q
    
    # Convert to JSON string
    json_str = json.dumps(results)
    
    # Base64 encode to bypass extension interference
    encoded = base64.b64encode(json_str.encode()).decode()
    
    # Return as plain text with CORS headers
    return Response(
        content=encoded, 
        media_type="text/plain",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Cache-Control": "no-cache"
        }
    )


@router.get("/proxy/suggest")
async def proxy_suggest(
    request: Request,
    q: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """
    Proxy endpoint for suggestions that returns base64-encoded JSON.
    """
    # Simple suggestion logic (same as in search_routes)
    popular_commands = [
        "ls", "cd", "grep", "find", "cat", "vim", "git", "ssh", "tar", "curl",
        "chmod", "chown", "cp", "mv", "rm", "mkdir", "rmdir", "touch", "echo"
    ]
    
    suggestions = [
        cmd for cmd in popular_commands 
        if cmd.lower().startswith(q.lower())
    ][:limit]
    
    result = {
        "suggestions": suggestions,
        "query": q
    }
    
    # Convert to JSON string
    json_str = json.dumps(result)
    
    # Base64 encode
    encoded = base64.b64encode(json_str.encode()).decode()
    
    # Return as plain text
    return Response(
        content=encoded, 
        media_type="text/plain",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Cache-Control": "no-cache"
        }
    )