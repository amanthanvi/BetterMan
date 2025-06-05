"""
Scalable batch loader for comprehensive man page loading.
Handles memory management, parallel processing, and progress tracking.
"""

import asyncio
import aiofiles
import gzip
import bz2
import lzma
import zstandard as zstd
import os
from typing import Dict, List, Optional, AsyncGenerator, Tuple, Any
from datetime import datetime, timedelta, timezone
import json
import psutil
import gc
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import multiprocessing as mp
import logging
import traceback
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .comprehensive_discovery import ComprehensiveManPageDiscovery
from .security_validator import ManPageSecurityValidator
from .enhanced_groff_parser import EnhancedGroffParser
from ..models.document import Document
from ..db.session import get_db_context, SessionLocal
from ..cache.cache_manager import CacheManager

logger = logging.getLogger(__name__)


class LoadingSession:
    """Track loading session state."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.start_time: datetime = datetime.now(timezone.utc)
        self.end_time: Optional[datetime] = None
        self.status = "initializing"
        self.total_pages = 0
        self.pages_processed = 0
        self.pages_success = 0
        self.pages_error = 0
        self.pages_skipped = 0
        self.current_section = None
        self.sections_completed = []
        self.error_log = []
        self.config = {}
        self.checkpoints = []

    def to_dict(self) -> Dict:
        """Convert session to dictionary."""
        return {
            "session_id": self.session_id,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "status": self.status,
            "total_pages": self.total_pages,
            "pages_processed": self.pages_processed,
            "pages_success": self.pages_success,
            "pages_error": self.pages_error,
            "pages_skipped": self.pages_skipped,
            "current_section": self.current_section,
            "sections_completed": self.sections_completed,
            "error_count": len(self.error_log),
            "config": self.config,
            "duration": self.get_duration(),
            "success_rate": self.get_success_rate(),
        }

    def get_duration(self) -> float:
        """Get session duration in seconds."""
        end = self.end_time or datetime.now(timezone.utc)
        return (end - self.start_time).total_seconds()

    def get_success_rate(self) -> float:
        """Get success rate percentage."""
        if self.pages_processed == 0:
            return 0.0
        return (self.pages_success / self.pages_processed) * 100


class ComprehensiveBatchLoader:
    """Scalable loader for ALL Linux man pages with resource management."""

    def __init__(
        self,
        batch_size: int = 100,
        max_workers: int = None,
        memory_limit_mb: int = 2048,
        enable_parallel_processing: bool = True,
        enable_caching: bool = True,
        compression_level: int = 6,
    ):

        self.batch_size = batch_size
        self.max_workers = max_workers or min(mp.cpu_count(), 8)
        self.memory_limit_mb = memory_limit_mb
        self.enable_parallel_processing = enable_parallel_processing
        self.enable_caching = enable_caching
        self.compression_level = compression_level

        self.discovery = ComprehensiveManPageDiscovery(self.max_workers)
        self.validator = ManPageSecurityValidator()
        self.parser = EnhancedGroffParser()
        self.cache_manager = CacheManager() if enable_caching else None

        self.session = None
        self.memory_monitor = MemoryMonitor(memory_limit_mb)

        # Compression handlers
        self.decompressors = {
            "gz": self._decompress_gzip,
            "bz2": self._decompress_bzip2,
            "xz": self._decompress_xz,
            "lzma": self._decompress_lzma,
            "zst": self._decompress_zstd,
            "Z": self._decompress_compress,
        }

    async def load_all_man_pages(
        self,
        priority_range: Optional[Tuple[int, int]] = None,
        sections_filter: Optional[List[str]] = None,
        resume_session: Optional[str] = None,
        dry_run: bool = False,
    ) -> AsyncGenerator[Dict, None]:
        """
        Load all man pages with comprehensive coverage.

        Args:
            priority_range: Tuple of (min_priority, max_priority) to filter
            sections_filter: List of sections to process
            resume_session: Session ID to resume from
            dry_run: If True, only simulate the loading process

        Yields:
            Progress updates as dictionaries
        """
        # Initialize or resume session
        if resume_session:
            self.session = await self._load_session(resume_session)
            if not self.session:
                raise ValueError(f"Session {resume_session} not found")
        else:
            self.session = LoadingSession(self._generate_session_id())
            self.session.config = {
                "batch_size": self.batch_size,
                "max_workers": self.max_workers,
                "memory_limit_mb": self.memory_limit_mb,
                "priority_range": priority_range,
                "sections_filter": sections_filter,
                "dry_run": dry_run,
            }

        self.session.status = "discovering"

        try:
            # Discover all available pages
            logger.info("🔍 Starting comprehensive man page discovery...")
            discovery_start = datetime.now(timezone.utc)

            def progress_callback(current, total):
                if current % 100 == 0:
                    logger.debug(f"Discovery progress: {current}/{total}")

            all_pages = await asyncio.get_event_loop().run_in_executor(
                None, self.discovery.discover_all_pages, progress_callback
            )

            discovery_duration = (
                datetime.now(timezone.utc) - discovery_start
            ).total_seconds()
            logger.info(f"Discovery completed in {discovery_duration:.1f}s")

            # Apply filters
            if priority_range:
                all_pages = self._filter_by_priority_range(all_pages, priority_range)

            if sections_filter:
                all_pages = {k: v for k, v in all_pages.items() if k in sections_filter}

            # Resume handling: skip completed sections
            if resume_session and self.session.sections_completed:
                for section in self.session.sections_completed:
                    all_pages.pop(section, None)

            # Calculate totals
            total_count = sum(len(pages) for pages in all_pages.values())
            self.session.total_pages = total_count

            logger.info(
                f"📊 Total pages to process: {total_count:,} across {len(all_pages)} sections"
            )

            if dry_run:
                # Yield dry run statistics
                yield {
                    "type": "dry_run",
                    "session_id": self.session.session_id,
                    "total_pages": total_count,
                    "sections": len(all_pages),
                    "breakdown": {
                        section: len(pages) for section, pages in all_pages.items()
                    },
                }
                return

            # Save session
            await self._save_session()

            # Process by priority groups
            self.session.status = "processing"
            priority_groups = self._group_by_priority(all_pages)

            for priority_level in sorted(priority_groups.keys()):
                priority_pages = priority_groups[priority_level]
                page_count = sum(len(pages) for pages in priority_pages.values())

                logger.info(
                    f"🎯 Processing priority level {priority_level} ({page_count:,} pages)"
                )

                async for batch_result in self._process_priority_group(
                    priority_pages, priority_level
                ):
                    yield batch_result

                # Checkpoint after each priority level
                await self._create_checkpoint(f"priority_{priority_level}_complete")

                # Memory cleanup between priority groups
                await self._cleanup_memory()

            # Finalize session
            self.session.status = "completed"
            self.session.end_time = datetime.now(timezone.utc)
            await self._save_session()

            # Final statistics
            yield {
                "type": "completion",
                "session": self.session.to_dict(),
                "discovery_stats": self.discovery.discovery_stats,
            }

        except asyncio.CancelledError:
            self.session.status = "cancelled"
            await self._save_session()
            raise
        except Exception as e:
            if self.session:
                self.session.status = "failed"
                self.session.error_log.append(
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "error": str(e),
                        "traceback": traceback.format_exc(),
                    }
                )
                await self._save_session()
            logger.error(f"Fatal error in comprehensive loading: {e}")
            raise

    def _group_by_priority(
        self, all_pages: Dict[str, List[Dict]]
    ) -> Dict[int, Dict[str, List[Dict]]]:
        """Group pages by priority level."""
        priority_groups = {}

        for section, pages in all_pages.items():
            for page in pages:
                priority = page["priority"]
                if priority not in priority_groups:
                    priority_groups[priority] = {}
                if section not in priority_groups[priority]:
                    priority_groups[priority][section] = []
                priority_groups[priority][section].append(page)

        return priority_groups

    async def _process_priority_group(
        self, priority_pages: Dict[str, List[Dict]], priority_level: int
    ) -> AsyncGenerator[Dict, None]:
        """Process a single priority group."""
        group_start_time = datetime.now(timezone.utc)
        group_total = sum(len(pages) for pages in priority_pages.values())
        group_processed = 0

        for section, pages in priority_pages.items():
            section_start_time = datetime.now(timezone.utc)
            self.session.current_section = section

            logger.info(f"📚 Processing section {section} ({len(pages):,} pages)")

            # Process in batches
            for i in range(0, len(pages), self.batch_size):
                batch_start = i
                batch_end = min(i + self.batch_size, len(pages))
                batch = pages[batch_start:batch_end]

                # Dynamic batch sizing based on memory pressure
                if self.memory_monitor.check_pressure():
                    logger.warning("⚠️ Memory pressure detected, reducing batch size")
                    batch = batch[: max(10, len(batch) // 2)]

                # Process batch
                batch_result = await self._process_batch(batch, section)

                # Update session statistics
                self.session.pages_processed += len(batch)
                self.session.pages_success += batch_result["success_count"]
                self.session.pages_error += batch_result["error_count"]
                self.session.pages_skipped += batch_result["skipped_count"]

                group_processed += len(batch)

                # Save errors to session
                if batch_result.get("errors"):
                    for error in batch_result["errors"][:10]:  # Limit error log size
                        self.session.error_log.append(
                            {
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "section": section,
                                "command": error.get("command", "unknown"),
                                "error": error.get("error", "unknown error"),
                            }
                        )

                # Calculate progress metrics
                section_progress = ((i + len(batch)) / len(pages)) * 100
                group_progress = (group_processed / group_total) * 100
                overall_progress = (
                    self.session.pages_processed / self.session.total_pages
                ) * 100

                # Estimate time remaining
                elapsed = (
                    datetime.now(timezone.utc) - self.session.start_time
                ).total_seconds()
                if self.session.pages_processed > 0:
                    rate = self.session.pages_processed / elapsed
                    remaining_pages = (
                        self.session.total_pages - self.session.pages_processed
                    )
                    eta_seconds = remaining_pages / rate if rate > 0 else None
                else:
                    eta_seconds = None

                # Yield progress update
                yield {
                    "type": "progress",
                    "session_id": self.session.session_id,
                    "priority_level": priority_level,
                    "section": section,
                    "batch": {
                        "number": (i // self.batch_size) + 1,
                        "total_batches": (len(pages) + self.batch_size - 1)
                        // self.batch_size,
                        "size": len(batch),
                        "success": batch_result["success_count"],
                        "errors": batch_result["error_count"],
                        "skipped": batch_result["skipped_count"],
                    },
                    "section_progress": {
                        "processed": i + len(batch),
                        "total": len(pages),
                        "percentage": section_progress,
                        "elapsed": (
                            datetime.now(timezone.utc) - section_start_time
                        ).total_seconds(),
                    },
                    "group_progress": {
                        "processed": group_processed,
                        "total": group_total,
                        "percentage": group_progress,
                    },
                    "overall_progress": {
                        "processed": self.session.pages_processed,
                        "total": self.session.total_pages,
                        "percentage": overall_progress,
                        "success_rate": self.session.get_success_rate(),
                        "elapsed": elapsed,
                        "eta_seconds": eta_seconds,
                    },
                    "memory": {
                        "usage_mb": self.memory_monitor.get_current_usage_mb(),
                        "percentage": self.memory_monitor.get_usage_percentage(),
                    },
                }

                # Periodic cleanup and checkpointing
                if i % (self.batch_size * 10) == 0:
                    await self._cleanup_memory()
                    await self._save_session()

            # Section completed
            self.session.sections_completed.append(section)
            section_duration = (
                datetime.now(timezone.utc) - section_start_time
            ).total_seconds()

            logger.info(f"✅ Section {section} completed in {section_duration:.1f}s")

    async def _process_batch(self, batch: List[Dict], section: str) -> Dict:
        """Process a batch of man pages."""
        if self.enable_parallel_processing and len(batch) > 20:
            return await self._process_batch_parallel(batch)
        else:
            return await self._process_batch_sequential(batch)

    async def _process_batch_parallel(self, batch: List[Dict]) -> Dict:
        """Process batch using parallel workers."""
        semaphore = asyncio.Semaphore(self.max_workers)
        tasks = []

        for page_info in batch:
            task = self._process_single_page_with_semaphore(page_info, semaphore)
            tasks.append(task)

        results = await asyncio.gather(*tasks, return_exceptions=True)
        return self._analyze_batch_results(batch, results)

    async def _process_batch_sequential(self, batch: List[Dict]) -> Dict:
        """Process batch sequentially for better memory control."""
        results = []

        for page_info in batch:
            try:
                result = await self._process_single_page(page_info)
                results.append(result)
            except Exception as e:
                results.append(e)
                logger.error(
                    f"Error processing {page_info.get('command', 'unknown')}: {e}"
                )

        return self._analyze_batch_results(batch, results)

    async def _process_single_page_with_semaphore(
        self, page_info: Dict, semaphore: asyncio.Semaphore
    ) -> Dict:
        """Process single page with semaphore control."""
        async with semaphore:
            return await self._process_single_page(page_info)

    async def _process_single_page(self, page_info: Dict) -> Dict:
        """Process a single man page."""
        start_time = datetime.now(timezone.utc)

        try:
            # Check cache first
            if self.cache_manager:
                cached = await self.cache_manager.get(f"manpage:{page_info['id']}")
                if cached:
                    return {"status": "cached", "command": page_info["command"]}

            # Check if already in database
            if await self._is_page_in_database(page_info):
                return {
                    "status": "skipped",
                    "reason": "already_exists",
                    "command": page_info["command"],
                }

            # Read file content
            content = await self._read_man_page_file(page_info)
            if not content:
                return {
                    "status": "error",
                    "reason": "read_failed",
                    "command": page_info["command"],
                }

            # Validate content
            content = self.validator.sanitize_content(content)

            # Parse content
            parsed_data = await self._parse_man_page(content, page_info)
            if not parsed_data:
                return {
                    "status": "error",
                    "reason": "parse_failed",
                    "command": page_info["command"],
                }

            # Save to database
            success = await self._save_to_database(page_info, content, parsed_data)
            if not success:
                return {
                    "status": "error",
                    "reason": "save_failed",
                    "command": page_info["command"],
                }

            # Cache if enabled
            if self.cache_manager:
                await self.cache_manager.set(
                    f"manpage:{page_info['id']}",
                    json.dumps(parsed_data),
                    ttl=86400,  # 24 hours
                )

            processing_time = (datetime.now(timezone.utc) - start_time).total_seconds()

            return {
                "status": "success",
                "command": page_info["command"],
                "section": page_info["section"],
                "size": len(content),
                "processing_time": processing_time,
            }

        except Exception as e:
            logger.error(f"Error processing {page_info.get('command', 'unknown')}: {e}")
            return {
                "status": "error",
                "command": page_info.get("command", "unknown"),
                "error": str(e),
                "traceback": traceback.format_exc(),
            }

    async def _read_man_page_file(self, page_info: Dict) -> Optional[str]:
        """Read and decompress man page file."""
        file_path = page_info["path"]
        compression = page_info.get("compression")

        try:
            if compression and compression in self.decompressors:
                # Read compressed file
                with open(file_path, "rb") as f:
                    compressed_data = f.read()

                # Decompress
                decompressor = self.decompressors[compression]
                content = await asyncio.get_event_loop().run_in_executor(
                    None, decompressor, compressed_data
                )

                return content.decode("utf-8", errors="replace")
            else:
                # Read uncompressed file
                async with aiofiles.open(
                    file_path, "r", encoding="utf-8", errors="replace"
                ) as f:
                    return await f.read()

        except Exception as e:
            logger.error(f"Error reading {file_path}: {e}")
            return None

    def _decompress_gzip(self, data: bytes) -> bytes:
        """Decompress gzip data."""
        return gzip.decompress(data)

    def _decompress_bzip2(self, data: bytes) -> bytes:
        """Decompress bzip2 data."""
        return bz2.decompress(data)

    def _decompress_xz(self, data: bytes) -> bytes:
        """Decompress xz/lzma data."""
        return lzma.decompress(data)

    def _decompress_lzma(self, data: bytes) -> bytes:
        """Decompress lzma data."""
        return lzma.decompress(data)

    def _decompress_zstd(self, data: bytes) -> bytes:
        """Decompress zstandard data."""
        dctx = zstd.ZstdDecompressor()
        return dctx.decompress(data)

    def _decompress_compress(self, data: bytes) -> bytes:
        """Decompress .Z (compress) data."""
        # This is tricky as Python doesn't have built-in support
        # We'll use subprocess as a fallback
        import subprocess
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".Z", delete=False) as tmp:
            tmp.write(data)
            tmp.flush()

            result = subprocess.run(
                ["uncompress", "-c", tmp.name], capture_output=True, timeout=10
            )

            os.unlink(tmp.name)

            if result.returncode == 0:
                return result.stdout
            else:
                raise Exception(f"Uncompress failed: {result.stderr}")

    async def _parse_man_page(self, content: str, page_info: Dict) -> Optional[Dict]:
        """Parse man page content."""
        try:
            # Use thread pool for CPU-intensive parsing
            loop = asyncio.get_event_loop()
            parsed = await loop.run_in_executor(
                None, self._parse_with_timeout, content, page_info
            )

            # Add metadata
            parsed["metadata"] = {
                "command": page_info["command"],
                "section": page_info["section"],
                "category": page_info["category"],
                "priority": page_info["priority"],
                "file_path": page_info["path"],
                "file_size": page_info["size"],
                "modified_time": page_info.get("modified_time"),
                "package_hint": page_info.get("package_hint"),
            }

            return parsed

        except Exception as e:
            logger.error(f"Error parsing {page_info['command']}: {e}")
            return None

    def _parse_with_timeout(
        self, content: str, page_info: Dict, timeout: int = 30
    ) -> Dict:
        """Parse content with timeout protection."""
        # This is a simplified version - in production you'd use process isolation
        import signal

        def timeout_handler(signum, frame):
            raise TimeoutError("Parsing timeout")

        # Set timeout
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(timeout)

        try:
            result = self.parser.parse(content)
            signal.alarm(0)  # Cancel timeout
            return result
        except TimeoutError:
            logger.warning(f"Parsing timeout for {page_info['command']}")
            raise
        finally:
            signal.alarm(0)  # Ensure timeout is cancelled

    async def _is_page_in_database(self, page_info: Dict) -> bool:
        """Check if page already exists in database."""
        async with get_async_session() as session:
            stmt = select(Document).where(
                Document.name == page_info["command"],
                Document.section == page_info["section"],
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none() is not None

    async def _save_to_database(
        self, page_info: Dict, raw_content: str, parsed_data: Dict
    ) -> bool:
        """Save processed man page to database."""
        try:
            async with get_async_session() as session:
                # Check if exists (with lock)
                stmt = (
                    select(Document)
                    .where(
                        Document.name == page_info["command"],
                        Document.section == page_info["section"],
                    )
                    .with_for_update()
                )

                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    # Update existing
                    existing.content = json.dumps(parsed_data)
                    existing.raw_content = raw_content[:1000000]  # Limit size
                    existing.title = parsed_data.get("title", page_info["command"])
                    existing.category = page_info["category"]
                    existing.tags = self._generate_tags(page_info, parsed_data)
                    existing.updated_at = datetime.now(timezone.utc)
                    existing.meta_info = {
                        **page_info,
                        "parsed_at": datetime.now(timezone.utc).isoformat(),
                    }
                else:
                    # Create new
                    document = Document(
                        name=page_info["command"],
                        section=page_info["section"],
                        title=parsed_data.get("title", page_info["command"]),
                        content=json.dumps(parsed_data),
                        raw_content=raw_content[:1000000],  # Limit size
                        category=page_info["category"],
                        tags=self._generate_tags(page_info, parsed_data),
                        meta_info={
                            **page_info,
                            "parsed_at": datetime.now(timezone.utc).isoformat(),
                        },
                    )
                    session.add(document)

                await session.commit()
                return True

        except Exception as e:
            logger.error(f"Database error for {page_info['command']}: {e}")
            return False

    def _generate_tags(self, page_info: Dict, parsed_data: Dict) -> str:
        """Generate tags for a man page."""
        tags = []

        # Section tag
        tags.append(f"section-{page_info['section']}")

        # Category tag
        if page_info.get("category"):
            tags.append(page_info["category"])

        # Priority tag
        tags.append(f"priority-{page_info.get('priority', 8)}")

        # Package hint
        if page_info.get("package_hint"):
            tags.append(f"package-{page_info['package_hint']}")

        # Extract keywords from parsed data
        if parsed_data.get("description"):
            # Simple keyword extraction (could be enhanced)
            desc_lower = parsed_data["description"].lower()
            keywords = ["network", "file", "system", "process", "security", "admin"]
            for keyword in keywords:
                if keyword in desc_lower:
                    tags.append(keyword)

        return ",".join(tags)

    def _analyze_batch_results(self, batch: List[Dict], results: List[Any]) -> Dict:
        """Analyze batch processing results."""
        success_count = 0
        error_count = 0
        skipped_count = 0
        cached_count = 0
        errors = []

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                error_count += 1
                errors.append(
                    {
                        "command": batch[i].get("command", "unknown"),
                        "error": str(result),
                        "type": type(result).__name__,
                    }
                )
            elif isinstance(result, dict):
                status = result.get("status")
                if status == "success":
                    success_count += 1
                elif status == "cached":
                    cached_count += 1
                    success_count += 1  # Count cached as success
                elif status == "skipped":
                    skipped_count += 1
                elif status == "error":
                    error_count += 1
                    errors.append(
                        {
                            "command": result.get("command", "unknown"),
                            "error": result.get("error", "unknown error"),
                            "reason": result.get("reason", "unknown"),
                        }
                    )
            else:
                error_count += 1

        return {
            "success_count": success_count,
            "error_count": error_count,
            "skipped_count": skipped_count,
            "cached_count": cached_count,
            "errors": errors,
        }

    def _filter_by_priority_range(
        self, all_pages: Dict[str, List[Dict]], priority_range: Tuple[int, int]
    ) -> Dict[str, List[Dict]]:
        """Filter pages by priority range."""
        filtered = {}
        min_priority, max_priority = priority_range

        for section, pages in all_pages.items():
            filtered_pages = [
                p for p in pages if min_priority <= p["priority"] <= max_priority
            ]
            if filtered_pages:
                filtered[section] = filtered_pages

        return filtered

    async def _cleanup_memory(self):
        """Perform memory cleanup."""
        gc.collect()
        await asyncio.sleep(0.1)  # Allow other tasks to run

        # Log memory usage
        usage = self.memory_monitor.get_current_usage_mb()
        if usage > self.memory_limit_mb * 0.8:
            logger.warning(f"High memory usage: {usage:.1f}MB")

    def _generate_session_id(self) -> str:
        """Generate unique session ID."""
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        return f"comprehensive_{timestamp}_{os.getpid()}"

    async def _save_session(self):
        """Save session state to database or file."""
        # This is a placeholder - implement based on your persistence needs
        session_data = self.session.to_dict()
        logger.debug(f"Session state: {json.dumps(session_data, indent=2)}")

    async def _load_session(self, session_id: str) -> Optional[LoadingSession]:
        """Load session from storage."""
        # This is a placeholder - implement based on your persistence needs
        logger.info(f"Loading session: {session_id}")
        return None

    async def _create_checkpoint(self, checkpoint_name: str):
        """Create a checkpoint for recovery."""
        self.session.checkpoints.append(
            {
                "name": checkpoint_name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "pages_processed": self.session.pages_processed,
                "sections_completed": list(self.session.sections_completed),
            }
        )
        await self._save_session()


class MemoryMonitor:
    """Monitor system memory usage."""

    def __init__(self, limit_mb: int):
        self.limit_mb = limit_mb
        self.process = psutil.Process()

    def get_current_usage_mb(self) -> float:
        """Get current memory usage in MB."""
        return self.process.memory_info().rss / 1024 / 1024

    def get_usage_percentage(self) -> float:
        """Get memory usage as percentage of system total."""
        return self.process.memory_percent()

    def check_pressure(self) -> bool:
        """Check if under memory pressure."""
        usage_mb = self.get_current_usage_mb()
        system_available = psutil.virtual_memory().available / 1024 / 1024

        # Check both process limit and system availability
        return (
            usage_mb > self.limit_mb * 0.8 or system_available < 500
        )  # Less than 500MB available
