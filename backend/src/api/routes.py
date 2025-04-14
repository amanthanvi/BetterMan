"""API routes for BetterMan."""

from fastapi import APIRouter, HTTPException, Query, Depends, BackgroundTasks
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
import os

from ..models.document import Document, Section, Subsection, RelatedDocument
from ..models.document import DocumentResponse, SearchResult
from ..parser.linux_parser import LinuxManParser
from ..parser.man_utils import get_available_man_pages, fetch_man_page_content
from ..db.session import get_db, engine, Base

router = APIRouter()
parser = LinuxManParser()


# Background task to import man pages
def import_man_pages(db: Session):
    """Import commonly used man pages from the system."""
    # Get available man pages
    available_pages = get_available_man_pages()

    # Filter to commonly used commands
    common_commands = [
        "ls",
        "cd",
        "pwd",
        "grep",
        "find",
        "cp",
        "mv",
        "rm",
        "mkdir",
        "rmdir",
        "cat",
        "less",
        "more",
        "head",
        "tail",
        "touch",
        "chmod",
        "chown",
        "ps",
        "top",
        "kill",
        "ping",
        "ssh",
        "scp",
        "tar",
        "gzip",
        "gunzip",
    ]

    # Import common commands first
    for command in common_commands:
        # Skip if already imported
        if db.query(Document).filter(Document.name == command).first():
            continue

        # Find the command in available pages
        command_pages = [p for p in available_pages if p["name"] == command]
        if not command_pages:
            continue

        # Get the first instance (usually from section 1)
        page_info = command_pages[0]

        # Fetch and parse man page
        try:
            content, metadata = fetch_man_page_content(
                page_info["name"], page_info["section"]
            )

            if not content:
                continue

            parsed_data = parser.parse_man_page(content)

            # Create document record
            document = Document(
                name=command,
                title=parsed_data["title"],
                section=(
                    int(parsed_data["section"])
                    if parsed_data["section"].isdigit()
                    else None
                ),
                summary=(
                    parsed_data["sections"][0]["content"]
                    if parsed_data["sections"]
                    else None
                ),
                raw_content=content,
            )
            db.add(document)
            db.flush()  # Get the ID without committing

            # Add sections
            for i, section_data in enumerate(parsed_data["sections"]):
                section = Section(
                    document_id=document.id,
                    name=section_data["name"],
                    content=section_data["content"],
                    order=i,
                )
                db.add(section)
                db.flush()

                # Add subsections if any
                if "subsections" in section_data:
                    for j, subsection_data in enumerate(section_data["subsections"]):
                        subsection = Subsection(
                            section_id=section.id,
                            name=subsection_data["name"],
                            content=subsection_data["content"],
                            order=j,
                        )
                        db.add(subsection)

            # Add related documents
            for related_name in parsed_data["related"]:
                related_doc = RelatedDocument(
                    document_id=document.id,
                    related_name=related_name,
                )
                db.add(related_doc)

            db.commit()
        except Exception as e:
            print(f"Error importing {command}: {e}")
            db.rollback()


@router.get("/docs", response_model=List[DocumentResponse])
async def list_documents(
    category: Optional[str] = None,
    section: Optional[int] = None,
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """
    List available documentation pages.

    Optional filtering by category and section.
    """
    query = db.query(Document)

    if category:
        query = query.filter(Document.title.ilike(f"%{category}%"))

    if section:
        query = query.filter(Document.section == section)

    documents = query.order_by(Document.name).offset(offset).limit(limit).all()

    if not documents:
        # If no documents found, trigger initial import
        background_tasks.add_task(import_man_pages, db)
        return []

    return documents


@router.get("/docs/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str, db: Session = Depends(get_db)):
    """Get a specific documentation page by ID."""
    # Try to find by name
    document = db.query(Document).filter(Document.name == doc_id).first()

    if not document:
        # Try to find by ID if doc_id is numeric
        if doc_id.isdigit():
            document = db.query(Document).filter(Document.id == int(doc_id)).first()

    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    return document


@router.get("/docs/{doc_id}/html", response_class=HTMLResponse)
async def get_document_html(doc_id: str, db: Session = Depends(get_db)):
    """Get a specific documentation page as HTML."""
    document = db.query(Document).filter(Document.name == doc_id).first()

    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    # Fetch sections and related documents
    sections = (
        db.query(Section)
        .filter(Section.document_id == document.id)
        .order_by(Section.order)
        .all()
    )
    related = (
        db.query(RelatedDocument)
        .filter(RelatedDocument.document_id == document.id)
        .all()
    )

    # Build structured data for HTML conversion
    structured_data = {
        "title": document.title,
        "section": document.section,
        "sections": [],
    }

    for section in sections:
        section_data = {
            "name": section.name,
            "content": section.content,
        }

        # Add subsections if any
        subsections = (
            db.query(Subsection)
            .filter(Subsection.section_id == section.id)
            .order_by(Subsection.order)
            .all()
        )
        if subsections:
            section_data["subsections"] = [
                {"name": sub.name, "content": sub.content} for sub in subsections
            ]

        structured_data["sections"].append(section_data)

    # Add related documents
    structured_data["related"] = [rel.related_name for rel in related]

    # Convert to HTML
    html_content = parser.convert_to_html(structured_data)

    return html_content


@router.get("/docs/{doc_id}/markdown")
async def get_document_markdown(doc_id: str, db: Session = Depends(get_db)):
    """Get a specific documentation page as Markdown."""
    document = db.query(Document).filter(Document.name == doc_id).first()

    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    # Fetch sections and related documents
    sections = (
        db.query(Section)
        .filter(Section.document_id == document.id)
        .order_by(Section.order)
        .all()
    )
    related = (
        db.query(RelatedDocument)
        .filter(RelatedDocument.document_id == document.id)
        .all()
    )

    # Build structured data for Markdown conversion
    structured_data = {
        "title": document.title,
        "section": document.section,
        "sections": [],
    }

    for section in sections:
        section_data = {
            "name": section.name,
            "content": section.content,
        }

        # Add subsections if any
        subsections = (
            db.query(Subsection)
            .filter(Subsection.section_id == section.id)
            .order_by(Subsection.order)
            .all()
        )
        if subsections:
            section_data["subsections"] = [
                {"name": sub.name, "content": sub.content} for sub in subsections
            ]

        structured_data["sections"].append(section_data)

    # Add related documents
    structured_data["related"] = [rel.related_name for rel in related]

    # Convert to Markdown
    markdown_content = parser.convert_to_markdown(structured_data)

    return {"markdown": markdown_content}


@router.get("/search", response_model=List[SearchResult])
async def search_documents(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Search documentation pages by query string."""
    # Create base query
    query = db.query(Document.id, Document.name, Document.title, Document.summary)

    # Apply filter
    query = query.filter(
        or_(
            Document.title.ilike(f"%{q}%"),
            Document.summary.ilike(f"%{q}%"),
            Document.id.in_(
                db.query(Section.document_id).filter(
                    or_(Section.name.ilike(f"%{q}%"), Section.content.ilike(f"%{q}%"))
                )
            ),
        )
    ).limit(limit)

    results = []
    for id, name, title, summary in query.all():
        # Calculate a simple relevance score
        score = 0.0
        if q.lower() in title.lower():
            score += 1.0
        if summary and q.lower() in summary.lower():
            score += 0.5

        results.append(
            {
                "id": name,  # Use name as ID for client-side lookups
                "title": title,
                "summary": summary,
                "score": score,
            }
        )

    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)

    return results


@router.get("/docs/{doc_id}/toc")
async def get_document_toc(doc_id: str, db: Session = Depends(get_db)):
    """Get the table of contents for a document."""
    document = db.query(Document).filter(Document.name == doc_id).first()

    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    # Fetch sections
    sections = (
        db.query(Section)
        .filter(Section.document_id == document.id)
        .order_by(Section.order)
        .all()
    )

    # Build table of contents
    toc = []
    for section in sections:
        section_item = {
            "id": f"section-{section.id}",
            "name": section.name,
            "level": 1,
        }
        toc.append(section_item)

        # Add subsections
        subsections = (
            db.query(Subsection)
            .filter(Subsection.section_id == section.id)
            .order_by(Subsection.order)
            .all()
        )
        for subsection in subsections:
            subsection_item = {
                "id": f"subsection-{subsection.id}",
                "name": subsection.name,
                "level": 2,
                "parent_id": f"section-{section.id}",
            }
            toc.append(subsection_item)

    return {"toc": toc}


@router.post("/docs/import")
async def import_new_document(
    name: str, section: Optional[str] = None, db: Session = Depends(get_db)
):
    """
    Import a specific man page by name and section.

    Args:
        name: The name of the man page to import
        section: Optional section number
    """
    # Check if already imported
    existing = db.query(Document).filter(Document.name == name).first()
    if existing:
        return {
            "message": f"Document '{name}' already exists",
            "document_id": existing.id,
        }

    # Fetch and parse man page
    try:
        content, metadata = fetch_man_page_content(name, section)

        if not content:
            raise HTTPException(status_code=404, detail=f"Man page '{name}' not found")

        parsed_data = parser.parse_man_page(content)

        # Create document record
        document = Document(
            name=name,
            title=parsed_data["title"],
            section=(
                int(parsed_data["section"])
                if parsed_data["section"].isdigit()
                else None
            ),
            summary=(
                parsed_data["sections"][0]["content"]
                if parsed_data["sections"]
                else None
            ),
            raw_content=content,
        )
        db.add(document)
        db.flush()  # Get the ID without committing

        # Add sections
        for i, section_data in enumerate(parsed_data["sections"]):
            section = Section(
                document_id=document.id,
                name=section_data["name"],
                content=section_data["content"],
                order=i,
            )
            db.add(section)
            db.flush()

            # Add subsections if any
            if "subsections" in section_data:
                for j, subsection_data in enumerate(section_data["subsections"]):
                    subsection = Subsection(
                        section_id=section.id,
                        name=subsection_data["name"],
                        content=subsection_data["content"],
                        order=j,
                    )
                    db.add(subsection)

        # Add related documents
        for related_name in parsed_data["related"]:
            related_doc = RelatedDocument(
                document_id=document.id,
                related_name=related_name,
            )
            db.add(related_doc)

        db.commit()

        return {
            "message": f"Document '{name}' imported successfully",
            "document_id": document.id,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Error importing document: {str(e)}"
        )
