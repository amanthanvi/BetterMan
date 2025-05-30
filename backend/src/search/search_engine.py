# backend/src/search/search_engine.py
"""Advanced search engine for BetterMan documentation."""

import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy import text, Table, Column, Integer, String, ForeignKey, create_engine
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from ..models.document import Document, Section, Subsection

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SearchEngine:
    """Implements advanced search functionality for documentation."""

    def __init__(self, db: Session):
        """Initialize the search engine.

        Args:
            db: Database session
        """
        self.db = db
        self._ensure_fts_tables()

    def _ensure_fts_tables(self) -> None:
        """Ensure FTS tables exist and are properly configured."""
        try:
            # Check if FTS5 is available
            result = self.db.execute(text("SELECT sqlite_source_id()")).scalar()
            if "fts5" not in result.lower():
                logger.warning(
                    "SQLite FTS5 extension not available, falling back to basic search"
                )
                return

            # Check if tables exist (migration should have created them)
            try:
                self.db.execute(text("SELECT * FROM fts_documents LIMIT 1"))
                self.db.execute(text("SELECT * FROM fts_sections LIMIT 1"))
                logger.info("FTS tables exist and are accessible")
            except Exception as e:
                logger.error(f"FTS tables not properly set up: {str(e)}")
                raise

        except Exception as e:
            logger.error(f"Error checking FTS tables: {str(e)}")
            raise

    def index_document(self, document_id: int) -> bool:
        """Index or update a document in the full-text search index.

        Args:
            document_id: ID of the document to index

        Returns:
            True if indexing was successful, False otherwise
        """
        try:
            # Get the document
            document = (
                self.db.query(Document).filter(Document.id == document_id).first()
            )
            if not document:
                logger.warning(f"Document with ID {document_id} not found for indexing")
                return False

            # Delete existing entries for this document
            self.db.execute(
                text("DELETE FROM fts_documents WHERE rowid = :doc_id"),
                {"doc_id": document_id},
            )
            self.db.execute(
                text("DELETE FROM fts_sections WHERE document_id = :doc_id"),
                {"doc_id": document_id},
            )

            # Insert document into FTS index
            self.db.execute(
                text(
                    """
                    INSERT INTO fts_documents(rowid, name, title, summary, content, section)
                    VALUES (:id, :name, :title, :summary, :content, :section)
                """
                ),
                {
                    "id": document.id,
                    "name": document.name,
                    "title": document.title or "",
                    "summary": document.summary or "",
                    "content": document.raw_content or "",
                    "section": str(document.section or ""),
                },
            )

            # Index each section
            for section in document.sections:
                section_content = section.content or ""

                # Index section
                self.db.execute(
                    text(
                        """
                        INSERT INTO fts_sections(document_id, section_name, section_content)
                        VALUES (:doc_id, :section_name, :section_content)
                    """
                    ),
                    {
                        "doc_id": document.id,
                        "section_name": section.name,
                        "section_content": section_content,
                    },
                )

            self.db.commit()
            logger.info(f"Successfully indexed document: {document.name}")
            return True

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error indexing document {document_id}: {str(e)}")
            return False

    def reindex_all_documents(self) -> int:
        """Rebuild the entire search index.

        Returns:
            Number of documents indexed
        """
        try:
            # Clear existing index
            self.db.execute(text("DELETE FROM fts_documents"))
            self.db.execute(text("DELETE FROM fts_sections"))

            # Get all documents
            documents = self.db.query(Document).all()

            # Index each document
            indexed_count = 0
            for document in documents:
                if self.index_document(document.id):
                    indexed_count += 1

            logger.info(f"Reindexed {indexed_count} documents")
            return indexed_count

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error reindexing documents: {str(e)}")
            return 0

    def _parse_query(self, query: str) -> str:
        """Parse and optimize the search query for FTS.

        Args:
            query: Raw search query

        Returns:
            Optimized FTS query
        """
        # Strip special characters but keep quotes for phrase searches
        clean_query = re.sub(r'[^\w\s"]', " ", query)

        # Check for quoted phrases
        phrases = re.findall(r'"([^"]+)"', clean_query)
        remaining = re.sub(r'"[^"]+"', "", clean_query)

        # Split remaining terms
        terms = [term for term in remaining.split() if term]

        if not terms and not phrases:
            return ""

        # Build FTS query
        fts_parts = []

        # Add phrases with exact match
        for phrase in phrases:
            fts_parts.append(f'"{phrase}"')

        # Add individual terms with various forms
        for term in terms:
            if len(term) <= 2:
                # For very short terms, just use exact match
                fts_parts.append(f"{term}")
            else:
                # For normal terms, add both exact and prefix match
                fts_parts.append(f"{term}")
                fts_parts.append(f"{term}*")  # Prefix matching

        # Join with OR for any match
        return " OR ".join(fts_parts)

    def search(
        self,
        query: str,
        section: Optional[int] = None,
        doc_set: Optional[str] = None,
        page: int = 1,
        per_page: int = 10,
    ) -> Dict[str, Any]:
        """Perform a full-text search with advanced relevance ranking.

        Args:
            query: Search query
            section: Filter by section number
            doc_set: Filter by document set
            page: Page number (1-indexed)
            per_page: Results per page

        Returns:
            Dictionary with search results and metadata
        """
        try:
            # Log the original query
            logger.info(f"Original search query: '{query}'")

            # Parse and optimize the query
            fts_query = self._parse_query(query)
            if not fts_query:
                logger.warning(f"Empty query after parsing: '{query}'")
                return {"results": [], "total": 0, "page": page, "per_page": per_page}

            logger.info(f"Parsed FTS query: '{fts_query}'")

            # Calculate offset for pagination
            offset = (page - 1) * per_page

            # Check if we have FTS tables
            has_fts = True
            try:
                self.db.execute(text("SELECT * FROM fts_documents LIMIT 1"))
            except Exception:
                has_fts = False
                logger.warning("FTS tables not available, falling back to basic search")

            # Handle search based on availability of FTS
            if has_fts:
                # Use FTS with BM25 ranking
                results = self._fts_search(fts_query, query, section, offset, per_page)
            else:
                # Fallback to basic search
                results = self._basic_search(query, section, offset, per_page)

            return results

        except Exception as e:
            logger.error(f"Search error: {str(e)}")
            # Return empty results on error
            return {
                "results": [],
                "total": 0,
                "page": page,
                "per_page": per_page,
                "error": str(e),
            }

    def _fts_search(
        self,
        fts_query: str,
        original_query: str,
        section: Optional[int],
        offset: int,
        per_page: int,
    ) -> Dict[str, Any]:
        """Perform search using SQLite FTS.

        Args:
            fts_query: Processed FTS query
            original_query: Original user query
            section: Section filter
            offset: Pagination offset
            per_page: Results per page

        Returns:
            Search results dictionary
        """
        # Base query using FTS
        raw_sql = """
        WITH ranked_docs AS (
            SELECT
                d.id,
                d.name,
                d.title,
                d.summary,
                d.section,
                d.access_count,
                fts.rank as fts_rank,
                CASE 
                    WHEN LOWER(d.name) = LOWER(:exact_match) THEN 10.0
                    WHEN LOWER(d.name) LIKE LOWER(:name_match) THEN 5.0
                    WHEN LOWER(d.title) LIKE LOWER(:title_match) THEN 3.0
                    ELSE 1.0
                END * fts.rank * (0.5 + (d.access_count / 50.0)) as final_score,
                highlight(fts_documents, 0, '<mark>', '</mark>') as name_highlight,
                highlight(fts_documents, 1, '<mark>', '</mark>') as title_highlight,
                highlight(fts_documents, 2, '<mark>', '</mark>') as summary_highlight,
                highlight(fts_documents, 3, '<mark>', '</mark>') as content_highlight
            FROM
                documents d
            JOIN
                fts_documents as fts ON d.id = fts.rowid
            WHERE
                fts_documents MATCH :query
                AND (:section IS NULL OR d.section = :section)
            ORDER BY
                final_score DESC
        )
        SELECT * FROM ranked_docs
        LIMIT :limit OFFSET :offset
        """

        # Count query
        count_sql = """
        SELECT COUNT(*) FROM documents d
        JOIN fts_documents as fts ON d.id = fts.rowid
        WHERE fts_documents MATCH :query
        AND (:section IS NULL OR d.section = :section)
        """

        # Execute search query
        result_rows = self.db.execute(
            text(raw_sql),
            {
                "query": fts_query,
                "exact_match": original_query.lower(),
                "name_match": f"%{original_query.lower()}%",
                "title_match": f"%{original_query.lower()}%",
                "section": section,
                "limit": per_page,
                "offset": offset,
            },
        ).fetchall()

        # Get total count
        total = (
            self.db.execute(
                text(count_sql), {"query": fts_query, "section": section}
            ).scalar()
            or 0
        )

        # Format results
        formatted_results = []
        for row in result_rows:
            matches = []

            # Add highlighted summary if available
            if row.summary_highlight and "<mark>" in row.summary_highlight:
                matches.append(self._clean_highlight(row.summary_highlight))

            # Add highlighted content if available
            if row.content_highlight and "<mark>" in row.content_highlight:
                # Extract context around highlights
                for match in re.finditer(
                    r"(.{0,40})<mark>(.+?)</mark>(.{0,40})", row.content_highlight
                ):
                    context = match.group(0)
                    matches.append(self._clean_highlight(context))

            result = {
                "id": row.name,
                "title": row.title or row.name,
                "summary": row.summary or "",
                "section": row.section,
                "score": float(row.final_score),
                "matches": matches[:3],  # Limit to 3 matches for display
                "highlighted_title": (
                    self._clean_highlight(row.title_highlight)
                    if "<mark>" in row.title_highlight
                    else None
                ),
            }

            formatted_results.append(result)

        # Return paginated results
        return {
            "results": formatted_results,
            "total": total,
            "page": offset // per_page + 1,
            "per_page": per_page,
            "has_more": (offset + per_page) < total,
        }

    def _basic_search(
        self, query: str, section: Optional[int], offset: int, per_page: int
    ) -> Dict[str, Any]:
        """Fallback search method using LIKE queries.

        Args:
            query: Search query
            section: Section filter
            offset: Pagination offset
            per_page: Results per page

        Returns:
            Search results dictionary
        """
        from sqlalchemy import or_

        # Create search pattern
        search_pattern = f"%{query}%"

        # Basic query using SQLite's LIKE operator
        base_query = self.db.query(Document).filter(
            or_(
                Document.name.ilike(search_pattern),
                Document.title.ilike(search_pattern),
                Document.summary.ilike(search_pattern),
                Document.raw_content.ilike(search_pattern),
            )
        )

        # Apply section filter
        if section:
            base_query = base_query.filter(Document.section == section)

        # Count total results
        total = base_query.count()

        # Add sorting and pagination
        results = (
            base_query.order_by(Document.name).offset(offset).limit(per_page).all()
        )

        # Format results
        formatted_results = []
        for doc in results:
            # Extract matches from content
            matches = self._extract_matches(doc.raw_content, query)

            # Calculate score
            score = 1.0
            if query.lower() in doc.name.lower():
                score = 2.0

            # Factor in access count for popularity
            score *= 1.0 + (doc.access_count or 0) / 100.0

            result = {
                "id": doc.name,
                "title": doc.title or doc.name,
                "summary": doc.summary or "",
                "section": doc.section,
                "score": score,
                "matches": matches[:3],  # Limit to 3 matches
            }

            formatted_results.append(result)

        return {
            "results": formatted_results,
            "total": total,
            "page": offset // per_page + 1,
            "per_page": per_page,
            "has_more": (offset + per_page) < total,
        }

    def _extract_matches(self, content: str, query: str) -> List[str]:
        """Extract matching content with context.

        Args:
            content: Document content
            query: Search query

        Returns:
            List of content matches with context
        """
        if not content or not query:
            return []

        matches = []
        content_lower = content.lower()
        query_lower = query.lower()

        # Find all occurrences
        start_pos = 0
        while True:
            pos = content_lower.find(query_lower, start_pos)
            if pos < 0:
                break

            # Get context around match
            context_start = max(0, pos - 40)
            context_end = min(len(content), pos + len(query) + 40)

            # Extract context
            context = content[context_start:context_end]

            # Add ellipsis if needed
            if context_start > 0:
                context = "..." + context
            if context_end < len(content):
                context = context + "..."

            # Highlight the match
            match_start = pos - context_start
            match_end = match_start + len(query)
            highlighted = (
                context[:match_start]
                + f"<mark>{context[match_start:match_end]}</mark>"
                + context[match_end:]
            )

            matches.append(highlighted)

            # Move to next position
            start_pos = pos + len(query)

            # Limit to 5 matches
            if len(matches) >= 5:
                break

        return matches

    def _clean_highlight(self, text: str) -> str:
        """Clean up highlighted text for display.

        Args:
            text: Highlighted text with <mark> tags

        Returns:
            Cleaned text with proper context
        """
        if not text:
            return ""

        # Extract parts with highlights
        parts = []
        for match in re.finditer(r"(.{0,40})<mark>(.+?)</mark>(.{0,40})", text):
            context = match.group(0)
            if match.start() > 0:
                context = "..." + context
            if match.end() < len(text):
                context = context + "..."
            parts.append(context)

        # If no highlights found, return a snippet
        if not parts and text:
            return text[:100] + ("..." if len(text) > 100 else "")

        return " [...] ".join(parts)
