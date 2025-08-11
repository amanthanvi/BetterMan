"""Background job scheduler for BetterMan maintenance tasks."""

import logging
import asyncio
import time
from datetime import datetime, timedelta
from typing import List, Callable, Dict, Any, Optional
from sqlalchemy.orm import Session
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

from ..db.session import get_db, SessionLocal
from ..cache.cache_manager import CacheManager
from ..parser.enhanced_groff_parser import EnhancedGroffParser as LinuxManParser

# Import man page extractor if available
try:
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from app.workers.extractor import ManPageExtractor
    EXTRACTOR_AVAILABLE = True
except ImportError:
    EXTRACTOR_AVAILABLE = False
    logger.warning("Man page extractor not available")

# Configure logging
logger = logging.getLogger(__name__)


class JobScheduler:
    """Manages background jobs for BetterMan."""

    def __init__(self, db_url: str):
        """Initialize the job scheduler.

        Args:
            db_url: SQLAlchemy database URL
        """
        # Convert URL to psycopg3 format if needed
        if db_url.startswith('postgresql://') and '+' not in db_url:
            db_url = db_url.replace('postgresql://', 'postgresql+psycopg://')
        
        self.db_url = db_url
        self.scheduler = BackgroundScheduler(
            jobstores={"default": SQLAlchemyJobStore(url=db_url)}
        )
        self.parser = LinuxManParser()
        self.running = False

    def start(self) -> None:
        """Start the scheduler."""
        if not self.running:
            # Schedule jobs
            self._schedule_jobs()
            self.scheduler.start()
            self.running = True
            logger.info("Background job scheduler started")

    def stop(self) -> None:
        """Stop the scheduler."""
        if self.running:
            self.scheduler.shutdown()
            self.running = False
            logger.info("Background job scheduler stopped")

    def _get_cache_manager(self) -> CacheManager:
        """Get a cache manager instance with a fresh DB session.

        Returns:
            CacheManager instance
        """
        db = SessionLocal()
        try:
            return CacheManager(db, self.parser)
        except Exception as e:
            db.close()
            raise e

    def _schedule_jobs(self) -> None:
        """Schedule all maintenance jobs."""
        # Initialize common commands cache - run once at startup and daily at midnight
        self.scheduler.add_job(
            prefetch_common_commands,
            "cron",
            hour=0,
            minute=0,
            id="prefetch_common_commands",
            replace_existing=True,
            args=[self.db_url]
        )

        # Update existing common commands - every 12 hours
        self.scheduler.add_job(
            update_common_commands,
            IntervalTrigger(hours=12),
            id="update_common_commands",
            replace_existing=True,
            args=[self.db_url]
        )

        # Update common commands list based on usage - daily at 2am
        self.scheduler.add_job(
            update_common_commands_list,
            "cron",
            hour=2,
            minute=0,
            id="update_common_commands_list",
            replace_existing=True,
            args=[self.db_url]
        )

        # Clean up old cache entries - daily at 3am
        self.scheduler.add_job(
            clean_cache,
            "cron",
            hour=3,
            minute=0,
            id="clean_cache",
            replace_existing=True,
            args=[self.db_url]
        )

        # Log cache statistics - hourly
        self.scheduler.add_job(
            log_cache_statistics,
            IntervalTrigger(hours=1),
            id="log_cache_statistics",
            replace_existing=True,
            args=[self.db_url]
        )
        
        # Extract man pages - daily at 3am (if extractor is available)
        if EXTRACTOR_AVAILABLE:
            self.scheduler.add_job(
                extract_man_pages,
                "cron",
                hour=3,
                minute=30,
                id="extract_man_pages",
                replace_existing=True,
                args=[self.db_url]
            )
            logger.info("Man page extraction job scheduled")

    def _prefetch_common_commands(self) -> None:
        """Pre-fetch all common commands."""
        logger.info("Starting prefetch of common commands")
        cache_manager = self._get_cache_manager()

        try:
            cache_manager.prefetch_common_commands()
            logger.info("Completed prefetch of common commands")
        except Exception as e:
            logger.error(f"Error during prefetch of common commands: {str(e)}")
        finally:
            # Close the session
            cache_manager.db.close()

    def _update_common_commands(self) -> None:
        """Update all common commands."""
        logger.info("Starting update of common commands")
        db = SessionLocal()

        try:
            # Get list of common commands
            cache_manager = CacheManager(db, self.parser)
            common_docs = db.query("name").filter_by(is_common=True).all()
            common_commands = [doc.name for doc in common_docs]

            updated = 0
            failed = 0

            # Update each command
            for cmd in common_commands:
                success = cache_manager.update_common_command(cmd)
                if success:
                    updated += 1
                else:
                    failed += 1

            logger.info(
                f"Completed update of common commands: {updated} updated, {failed} failed"
            )
        except Exception as e:
            logger.error(f"Error during update of common commands: {str(e)}")
        finally:
            db.close()

    def _update_common_commands_list(self) -> None:
        """Update the list of common commands based on usage patterns."""
        logger.info("Starting update of common commands list")
        cache_manager = self._get_cache_manager()

        try:
            cache_manager.update_common_commands_list()
            logger.info("Completed update of common commands list")
        except Exception as e:
            logger.error(f"Error during update of common commands list: {str(e)}")
        finally:
            cache_manager.db.close()

    def _clean_cache(self) -> None:
        """Clean up old cache entries."""
        logger.info("Starting cache cleanup")
        db = SessionLocal()

        try:
            # Remove old non-common entries
            six_months_ago = datetime.utcnow() - timedelta(days=180)

            # Get candidates for deletion
            candidates = (
                db.query("Document")
                .filter(
                    Document.is_common == False,
                    Document.last_accessed < six_months_ago,
                    Document.access_count < 10,
                )
                .all()
            )

            if candidates:
                for doc in candidates:
                    db.delete(doc)
                db.commit()
                logger.info(f"Cleaned up {len(candidates)} old cache entries")
            else:
                logger.info("No old cache entries to clean up")

        except Exception as e:
            db.rollback()
            logger.error(f"Error during cache cleanup: {str(e)}")
        finally:
            db.close()

    def _log_cache_statistics(self) -> None:
        """Log cache statistics."""
        cache_manager = self._get_cache_manager()

        try:
            stats = cache_manager.get_cache_statistics()
            logger.info(
                f"Cache statistics: {stats['total_documents']} total documents, "
                f"{stats['common_documents']} common documents, "
                f"{stats['cache_hit_rate']:.2f} hit rate"
            )
        except Exception as e:
            logger.error(f"Error logging cache statistics: {str(e)}")
        finally:
            cache_manager.db.close()

    def run_job_now(self, job_id: str) -> bool:
        """Run a scheduled job immediately.

        Args:
            job_id: Job identifier

        Returns:
            True if job was run, False if job not found
        """
        job = self.scheduler.get_job(job_id)
        if job:
            job.func()
            return True
        return False


# Standalone job functions
def prefetch_common_commands(db_url: str) -> None:
    """Pre-fetch all common commands."""
    logger.info("Starting prefetch of common commands")
    db = SessionLocal()
    parser = LinuxManParser()
    
    try:
        cache_manager = CacheManager(db, parser)
        cache_manager.prefetch_common_commands()
        logger.info("Completed prefetch of common commands")
    except Exception as e:
        logger.error(f"Error during prefetch of common commands: {str(e)}")
    finally:
        db.close()


def update_common_commands(db_url: str) -> None:
    """Update all common commands."""
    logger.info("Starting update of common commands")
    db = SessionLocal()
    parser = LinuxManParser()
    
    try:
        # Get list of common commands
        cache_manager = CacheManager(db, parser)
        from ..models.document import Document
        common_docs = db.query(Document).filter_by(is_common=True).all()
        common_commands = [doc.name for doc in common_docs]
        
        updated = 0
        failed = 0
        
        # Update each command
        for cmd in common_commands:
            success = cache_manager.update_common_command(cmd)
            if success:
                updated += 1
            else:
                failed += 1
        
        logger.info(
            f"Completed update of common commands: {updated} updated, {failed} failed"
        )
    except Exception as e:
        logger.error(f"Error during update of common commands: {str(e)}")
    finally:
        db.close()


def update_common_commands_list(db_url: str) -> None:
    """Update the list of common commands based on usage patterns."""
    logger.info("Starting update of common commands list")
    db = SessionLocal()
    parser = LinuxManParser()
    
    try:
        cache_manager = CacheManager(db, parser)
        cache_manager.update_common_commands_list()
        logger.info("Completed update of common commands list")
    except Exception as e:
        logger.error(f"Error during update of common commands list: {str(e)}")
    finally:
        db.close()


def clean_cache(db_url: str) -> None:
    """Clean up old cache entries."""
    logger.info("Starting cache cleanup")
    db = SessionLocal()
    
    try:
        # Remove old non-common entries
        six_months_ago = datetime.utcnow() - timedelta(days=180)
        from ..models.document import Document
        
        # Get candidates for deletion
        candidates = (
            db.query(Document)
            .filter(
                Document.is_common == False,
                Document.last_accessed < six_months_ago,
                Document.access_count < 10,
            )
            .all()
        )
        
        if candidates:
            for doc in candidates:
                db.delete(doc)
            db.commit()
            logger.info(f"Cleaned up {len(candidates)} old cache entries")
        else:
            logger.info("No old cache entries to clean up")
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error during cache cleanup: {str(e)}")
    finally:
        db.close()


def log_cache_statistics(db_url: str) -> None:
    """Log cache statistics."""
    db = SessionLocal()
    parser = LinuxManParser()
    
    try:
        cache_manager = CacheManager(db, parser)
        stats = cache_manager.get_cache_statistics()
        logger.info(
            f"Cache statistics: {stats['total_documents']} total documents, "
            f"{stats['common_documents']} common documents, "
            f"{stats['cache_hit_rate']:.2f} hit rate"
        )
    except Exception as e:
        logger.error(f"Error logging cache statistics: {str(e)}")
    finally:
        db.close()


def extract_man_pages(db_url: str) -> None:
    """Extract man pages from system.
    
    Args:
        db_url: Database URL for storing extracted pages
    """
    if not EXTRACTOR_AVAILABLE:
        logger.warning("Man page extractor not available, skipping extraction")
        return
    
    logger.info("Starting man page extraction job")
    
    try:
        # Run extraction asynchronously
        extractor = ManPageExtractor(db_url)
        
        # Create event loop if not exists
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        # Run extraction
        loop.run_until_complete(extractor.run_extraction(incremental=True))
        
        logger.info("Man page extraction completed")
        
    except Exception as e:
        logger.error(f"Man page extraction failed: {e}")


# Singleton instance
_scheduler_instance = None


def get_scheduler(db_url: Optional[str] = None) -> JobScheduler:
    """Get the scheduler instance (singleton).

    Args:
        db_url: SQLAlchemy database URL (only used on first call)

    Returns:
        JobScheduler instance
    """
    global _scheduler_instance
    if _scheduler_instance is None:
        if db_url is None:
            raise ValueError("db_url must be provided on first call")
        _scheduler_instance = JobScheduler(db_url)
    return _scheduler_instance
