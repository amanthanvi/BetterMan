"""Data models for BetterMan documents."""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict


class Section(BaseModel):
    """A section of a document."""

    name: str
    content: str


class DocumentResponse(BaseModel):
    """Response model for document data."""

    id: str
    title: str
    summary: Optional[str] = None
    sections: Optional[List[Section]] = None
    related: Optional[List[str]] = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "id": "ls",
                "title": "ls",
                "summary": "List directory contents",
                "sections": [
                    {"name": "NAME", "content": "ls - list directory contents"},
                    {"name": "SYNOPSIS", "content": "ls [OPTION]... [FILE]..."},
                    {
                        "name": "DESCRIPTION",
                        "content": "List information about the FILEs...",
                    },
                ],
                "related": ["dir", "vdir", "chmod", "touch"],
            }
        }
    }


class SearchResult(BaseModel):
    """Result model for search queries."""

    id: str
    title: str
    summary: Optional[str] = None
    score: float = Field(..., description="Relevance score for the search result")

    model_config = {
        "json_schema_extra": {
            "example": {
                "id": "ls",
                "title": "ls",
                "summary": "List directory contents",
                "score": 0.95,
            }
        }
    }
