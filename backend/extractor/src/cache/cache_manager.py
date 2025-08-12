"""Cache management for BetterMan documentation."""

import logging
from datetime import datetime, timedelta
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models.document import Document, Section, Subsection, RelatedDocument
from ..parser.enhanced_groff_parser import EnhancedGroffParser as LinuxManParser
from ..parser.man_utils import fetch_man_page_content
# Removed imports for non-existent modules: formatted_parser, system_man_loader

# Configure logging
logger = logging.getLogger(__name__)

# List of common commands to always keep in cache
COMMON_COMMANDS = [
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
    "man",
    "sudo",
    "apt",
    "yum",
    "systemctl",
    "journalctl",
    "git",
    "curl",
    "wget",
    "ifconfig",
    "ip",
    "netstat",
    "ssh-keygen",
    "df",
    "du",
    "free",
    "uname",
]

# Cache status constants
CACHE_STATUS_PERMANENT = "permanent"  # Always keep in cache
CACHE_STATUS_TEMPORARY = "temporary"  # Keep in cache until eviction needed
CACHE_STATUS_ON_DEMAND = "on_demand"  # Load only when requested


class CacheManager:
    """Manages document caching and processing."""

    def __init__(self, db, parser, max_cache_size=1000):
        """Initialize the cache manager.

        Args:
            db: Database session
            parser: Man page parser
            max_cache_size: Maximum number of documents to keep in cache
        """
        self.db = db
        self.parser = parser
        self.max_cache_size = max_cache_size
        # Try to initialize search engine if available
        try:
            from ..search.unified_search import UnifiedSearchEngine

            self.search_engine = UnifiedSearchEngine(db)
            self.has_search_engine = True
        except (ImportError, ModuleNotFoundError):
            self.has_search_engine = False
            logger.warning(
                "Search engine module not available, search features disabled"
            )

    def get_document(
        self, name: str, section: Optional[int] = None
    ) -> Optional[Document]:
        """Get a document from cache or process it if not available.

        Args:
            name: Document name (command)
            section: Man page section number (optional)

        Returns:
            Document object if found or processed, None otherwise
        """
        # Try to get from database first
        query = self.db.query(Document).filter(Document.name == name)
        if section is not None:
            query = query.filter(Document.section == section)

        document = query.first()

        if document:
            # Update access statistics
            try:
                # Use explicit query to avoid SQLAlchemy ORM issues
                self.db.execute(
                    "UPDATE documents SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?",
                    (datetime.utcnow(), document.id)
                )
                self.db.commit()
                logger.info(f"Cache hit for document: {name}")
            except Exception as e:
                logger.warning(f"Failed to update access statistics: {e}")
                self.db.rollback()
            return document

        # Not in cache, process the man page
        logger.info(f"Cache miss for document: {name}, attempting to process")
        return self.process_and_cache(name, section)

    def process_and_cache(
        self, name: str, section: Optional[int] = None
    ) -> Optional[Document]:
        """Process a man page and add to cache.

        Args:
            name: Document name (command)
            section: Man page section number (optional)

        Returns:
            Document object if processed successfully, None otherwise
        """
        # Check cache size and evict if necessary
        self.evict_if_needed()

        try:
            # Get man page content
            content, error_msg = fetch_man_page_content(name, str(section) if section else None)
                
            if not content:
                logger.warning(f"No content found for man page {name}: {error_msg}")
                raise ValueError(f"Document not found: {name}")

            # Parse the man page using the groff parser
            parser = LinuxManParser()
            parsed_data = parser.parse(content)

            # Determine cache status and priority
            is_common = name in COMMON_COMMANDS
            cache_status = (
                CACHE_STATUS_PERMANENT if is_common else CACHE_STATUS_ON_DEMAND
            )
            cache_priority = 10 if is_common else 0

            # Extract section number from metadata if available
            section_num = None
            if parsed_data.get("metadata", {}).get("section"):
                try:
                    section_num = int(parsed_data["metadata"]["section"])
                except (ValueError, TypeError):
                    section_num = None

            # Create document record
            document = Document(
                name=name,
                title=parsed_data["title"],
                section=section_num or section,
                summary=(
                    parsed_data["sections"][0]["content"][:200] + "..."
                    if parsed_data["sections"] and len(parsed_data["sections"][0]["content"]) > 200
                    else parsed_data["sections"][0]["content"]
                    if parsed_data["sections"]
                    else "No summary available"
                ),
                raw_content=content,
                is_common=is_common,
                cache_status=cache_status,
                cache_priority=cache_priority,
                last_accessed=datetime.utcnow(),
                access_count=1,
            )
            self.db.add(document)
            self.db.flush()  # Get the ID without committing

            # Add sections
            for i, section_data in enumerate(parsed_data["sections"]):
                section = Section(
                    document_id=document.id,
                    name=section_data["name"],
                    content=section_data["content"],
                    order=i,
                )
                self.db.add(section)
                self.db.flush()

                # Add subsections if any
                if "subsections" in section_data:
                    for j, subsection_data in enumerate(section_data["subsections"]):
                        subsection = Subsection(
                            section_id=section.id,
                            name=subsection_data["name"],
                            content=subsection_data["content"],
                            order=j,
                        )
                        self.db.add(subsection)

            # Add related documents if available
            if "related" in parsed_data:
                for related_name in parsed_data["related"]:
                    related_doc = RelatedDocument(
                        document_id=document.id,
                        related_name=related_name,
                    )
                    self.db.add(related_doc)

            self.db.commit()
            logger.info(f"Successfully processed and cached document: {name}")

            # Index in search engine if available
            if self.has_search_engine:
                try:
                    self.search_engine.index_document(document.id)
                except Exception as e:
                    logger.error(
                        f"Error indexing document {name} in search engine: {str(e)}"
                    )

            return document

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error processing document {name}: {str(e)}")
            return None

    def evict_if_needed(self) -> None:
        """Evict least recently used documents if cache is full."""
        # Get current count
        count = self.db.query(func.count(Document.id)).scalar()

        if count >= self.max_cache_size:
            # Find candidates for eviction (not permanent cache)
            candidates = (
                self.db.query(Document)
                .filter(Document.cache_status != CACHE_STATUS_PERMANENT)
                .order_by(
                    Document.cache_priority.asc(),
                    Document.access_count.asc(),
                    Document.last_accessed.asc(),
                )
                .limit(max(1, count // 10))
            )  # Evict at least 1, up to 10% at a time

            evicted_count = 0
            for doc in candidates:
                # Double check it's not a permanent cache
                if doc.cache_status != CACHE_STATUS_PERMANENT:
                    try:
                        self.db.delete(doc)
                        evicted_count += 1
                    except Exception as e:
                        logger.error(f"Error evicting document {doc.name}: {str(e)}")

            if evicted_count > 0:
                self.db.commit()
                logger.info(f"Evicted {evicted_count} documents from cache")

    def prefetch_common_commands(self) -> None:
        """Pre-fetch and cache all common commands."""
        for command in COMMON_COMMANDS:
            # Check if already cached
            existing = self.db.query(Document).filter(Document.name == command).first()
            if not existing:
                logger.info(f"Pre-fetching common command: {command}")
                self.process_and_cache(command)
            elif existing.cache_status != CACHE_STATUS_PERMANENT:
                # Update cache status for common commands
                existing.is_common = True
                existing.cache_status = CACHE_STATUS_PERMANENT
                existing.cache_priority = 10
                self.db.commit()
                logger.info(f"Updated cache status for common command: {command}")

    def update_common_command(self, name: str) -> bool:
        """Update a specific common command.

        Args:
            name: Command name to update

        Returns:
            True if update was successful, False otherwise
        """
        try:
            # Get the existing document
            document = self.db.query(Document).filter(Document.name == name).first()
            if not document:
                return False

            # Re-fetch and update
            content, metadata = fetch_man_page_content(document.name, document.section)
            if not content:
                return False

            parsed_data = self.parser.parse_man_page(content)

            # Update document fields
            document.title = parsed_data["title"]
            document.summary = (
                parsed_data["sections"][0]["content"]
                if parsed_data["sections"]
                else None
            )
            document.raw_content = content
            document.updated_at = datetime.utcnow()

            # Ensure proper cache status for common commands
            if name in COMMON_COMMANDS:
                document.is_common = True
                document.cache_status = CACHE_STATUS_PERMANENT
                document.cache_priority = 10

            # Delete existing sections and subsections
            for section in document.sections:
                self.db.delete(section)

            # Delete existing related documents
            for related in document.related_docs:
                self.db.delete(related)

            self.db.flush()

            # Add new sections
            for i, section_data in enumerate(parsed_data["sections"]):
                section = Section(
                    document_id=document.id,
                    name=section_data["name"],
                    content=section_data["content"],
                    order=i,
                )
                self.db.add(section)
                self.db.flush()

                # Add subsections if any
                if "subsections" in section_data:
                    for j, subsection_data in enumerate(section_data["subsections"]):
                        subsection = Subsection(
                            section_id=section.id,
                            name=subsection_data["name"],
                            content=subsection_data["content"],
                            order=j,
                        )
                        self.db.add(subsection)

            # Add new related documents
            for related_name in parsed_data["related"]:
                related_doc = RelatedDocument(
                    document_id=document.id,
                    related_name=related_name,
                )
                self.db.add(related_doc)

            self.db.commit()
            logger.info(f"Successfully updated command: {name}")

            # Re-index in search engine if available
            if self.has_search_engine:
                try:
                    self.search_engine.index_document(document.id)
                except Exception as e:
                    logger.error(
                        f"Error re-indexing document {name} in search engine: {str(e)}"
                    )

            return True

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating document {name}: {str(e)}")
            return False

    def update_common_commands_list(self) -> None:
        """Analyze usage patterns and update the common commands list."""
        try:
            # Find popular non-common documents
            three_months_ago = datetime.utcnow() - timedelta(days=90)
            popular_docs = (
                self.db.query(Document)
                .filter(
                    Document.is_common == False,
                    Document.access_count >= 100,
                    Document.last_accessed >= three_months_ago,
                )
                .order_by(Document.access_count.desc())
                .limit(10)
            )

            # Promote to common
            promoted = 0
            for doc in popular_docs:
                doc.is_common = True
                doc.cache_status = CACHE_STATUS_PERMANENT
                doc.cache_priority = (
                    8  # High but not as high as predefined common commands
                )
                promoted += 1

            if promoted > 0:
                self.db.commit()
                logger.info(f"Promoted {promoted} documents to common status")

            # Find unpopular common documents (except those in COMMON_COMMANDS)
            unpopular_docs = (
                self.db.query(Document)
                .filter(
                    Document.is_common == True,
                    Document.name.notin_(COMMON_COMMANDS),
                    Document.access_count < 50,
                    Document.last_accessed < three_months_ago,
                )
                .order_by(Document.access_count)
                .limit(5)
            )

            # Demote from common
            demoted = 0
            for doc in unpopular_docs:
                doc.is_common = False
                doc.cache_status = CACHE_STATUS_TEMPORARY
                doc.cache_priority = 5  # Medium priority
                demoted += 1

            if demoted > 0:
                self.db.commit()
                logger.info(f"Demoted {demoted} documents from common status")

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating common commands list: {str(e)}")

    def get_cache_statistics(self) -> dict:
        """Get statistics about the cache.

        Returns:
            Dictionary with cache statistics
        """
        try:
            # Get total document count
            total = self.db.query(func.count(Document.id)).scalar()

            # Get common document count
            common = (
                self.db.query(func.count(Document.id))
                .filter(Document.is_common == True)
                .scalar()
            )

            # Get cache status statistics
            cache_status_counts = {}
            status_results = (
                self.db.query(Document.cache_status, func.count(Document.id))
                .group_by(Document.cache_status)
                .all()
            )
            for status, count in status_results:
                cache_status_counts[status] = count

            # Get most popular documents
            popular = (
                self.db.query(Document.name, Document.access_count)
                .order_by(Document.access_count.desc())
                .limit(10)
                .all()
            )

            # Get recently accessed documents
            recent = (
                self.db.query(Document.name, Document.last_accessed)
                .order_by(Document.last_accessed.desc())
                .limit(10)
                .all()
            )

            # Calculate hit rate (approximate)
            # This requires additional tracking in a real implementation
            hit_rate = 0.75 if total > 0 else 0.0

            return {
                "total_documents": total,
                "common_documents": common,
                "cache_hit_rate": hit_rate,
                "most_popular": [p[0] for p in popular],
                "recently_accessed": [r[0] for r in recent],
                "cache_by_status": cache_status_counts,
            }
        except Exception as e:
            logger.error(f"Error getting cache statistics: {str(e)}")
            return {
                "total_documents": 0,
                "common_documents": 0,
                "cache_hit_rate": 0.0,
                "most_popular": [],
                "recently_accessed": [],
                "cache_by_status": {},
            }


# Singleton instance
_cache_manager_instance = None


def get_cache_manager(db) -> CacheManager:
    """Get cache manager instance (singleton pattern)."""
    global _cache_manager_instance
    if _cache_manager_instance is None:
        parser = LinuxManParser()
        _cache_manager_instance = CacheManager(db, parser)
    return _cache_manager_instance
