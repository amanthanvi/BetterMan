"""Admin API routes for data management."""

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from typing import Optional
import json
import logging
from pathlib import Path
from datetime import datetime

from ..db.session import get_db
from ..models.document import Document
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/load-json-data")
async def load_json_data(
    db: Session = Depends(get_db),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """Load man pages from JSON files into the database."""
    
    # Simple token-based auth - you should set ADMIN_TOKEN env var in Vercel
    expected_token = settings.ADMIN_TOKEN if hasattr(settings, 'ADMIN_TOKEN') else None
    if not expected_token or admin_token != expected_token:
        raise HTTPException(status_code=403, detail="Invalid admin token")
    
    # Path to JSON files
    json_path = Path("/app/data/man-pages")
    if not json_path.exists():
        # Try alternate paths
        json_path = Path("data/man-pages")
        if not json_path.exists():
            json_path = Path("/var/task/data/man-pages")  # Vercel path
    
    if not json_path.exists():
        return {"error": f"JSON directory not found at {json_path}"}
    
    json_files = list(json_path.glob("*.json"))
    
    loaded_count = 0
    updated_count = 0
    error_count = 0
    errors = []
    
    for json_file in json_files:
        try:
            # Read JSON file
            with open(json_file, 'r') as f:
                data = json.load(f)
            
            # Extract name and section from filename
            parts = json_file.stem.split('.')
            if len(parts) >= 2:
                name = parts[0]
                section = parts[1]
            else:
                continue
            
            # Check if document exists
            existing_doc = db.query(Document).filter_by(
                name=name, 
                section=section
            ).first()
            
            # Prepare content
            content_data = {
                "sections": data.get("sections", []),
                "options": data.get("flags", data.get("options", [])),
                "examples": data.get("examples", []),
                "keywords": data.get("keywords", []),
                "complexity": data.get("complexity", "basic"),
                "hasInteractiveExamples": data.get("hasInteractiveExamples", False),
                "hasDiagrams": data.get("hasDiagrams", False)
            }
            
            if existing_doc:
                # Update existing
                existing_doc.title = data.get("title", f"{name} manual page")
                existing_doc.summary = data.get("description", data.get("summary", ""))
                existing_doc.content = json.dumps(content_data)
                existing_doc.category = data.get("category", "User Commands")
                existing_doc.is_common = data.get("isCommon", False)
                existing_doc.updated_at = datetime.utcnow()
                updated_count += 1
            else:
                # Create new
                new_doc = Document(
                    name=name,
                    section=section,
                    title=data.get("title", f"{name} manual page"),
                    summary=data.get("description", data.get("summary", "")),
                    content=json.dumps(content_data),
                    raw_content=data.get("synopsis", ""),
                    category=data.get("category", "User Commands"),
                    is_common=data.get("isCommon", False),
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                db.add(new_doc)
                loaded_count += 1
            
            # Commit periodically
            if (loaded_count + updated_count) % 100 == 0:
                db.commit()
                
        except Exception as e:
            error_count += 1
            errors.append(f"{json_file.name}: {str(e)}")
            db.rollback()
            continue
    
    # Final commit
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        return {"error": f"Final commit failed: {str(e)}"}
    
    return {
        "success": True,
        "loaded": loaded_count,
        "updated": updated_count,
        "errors": error_count,
        "total_processed": loaded_count + updated_count,
        "error_details": errors[:10]  # First 10 errors
    }

@router.get("/stats")
async def get_stats(
    db: Session = Depends(get_db),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """Get database statistics."""
    
    # Simple token-based auth
    expected_token = settings.ADMIN_TOKEN if hasattr(settings, 'ADMIN_TOKEN') else None
    if not expected_token or admin_token != expected_token:
        raise HTTPException(status_code=403, detail="Invalid admin token")
    
    total_docs = db.query(Document).count()
    docs_with_content = db.query(Document).filter(Document.content != None).count()
    
    return {
        "total_documents": total_docs,
        "documents_with_content": docs_with_content,
        "documents_without_content": total_docs - docs_with_content
    }