"""API routes for BetterMan."""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from ..models.document import DocumentResponse, SearchResult
from ..parser.linux_parser import LinuxManParser

router = APIRouter()

# Placeholder data for demonstration
EXAMPLE_DOCS = [
    {"id": "ls", "title": "ls", "summary": "List directory contents"},
    {"id": "cd", "title": "cd", "summary": "Change directory"},
    {"id": "grep", "title": "grep", "summary": "Search text patterns"},
]


@router.get("/docs", response_model=List[DocumentResponse])
async def list_documents(
    category: Optional[str] = None,
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    List available documentation pages.

    Optional filtering by category.
    """
    # This is a placeholder implementation
    # In a real app, we would query the database
    filtered_docs = EXAMPLE_DOCS
    if category:
        filtered_docs = [
            doc for doc in EXAMPLE_DOCS if category.lower() in doc["title"].lower()
        ]

    return filtered_docs[offset : offset + limit]


@router.get("/docs/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str):
    """Get a specific documentation page by ID."""
    # This is a placeholder implementation
    # In a real app, we would query the database or parse the man page
    for doc in EXAMPLE_DOCS:
        if doc["id"] == doc_id:
            return doc

    raise HTTPException(status_code=404, detail="Document not found")


@router.get("/search", response_model=List[SearchResult])
async def search_documents(
    query: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=100),
):
    """Search documentation pages by query string."""
    # This is a placeholder implementation
    # In a real app, we would use a full-text search index
    results = []
    for doc in EXAMPLE_DOCS:
        if (
            query.lower() in doc["title"].lower()
            or query.lower() in doc["summary"].lower()
        ):
            results.append(
                {
                    "id": doc["id"],
                    "title": doc["title"],
                    "summary": doc["summary"],
                    "score": 1.0,  # Placeholder score
                }
            )

    return results[:limit]
