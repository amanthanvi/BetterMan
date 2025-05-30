"""Simple background job scheduler for BetterMan maintenance tasks."""

import logging
import asyncio
from datetime import datetime, timedelta
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from ..db.session import SessionLocal
from ..cache.cache_manager import CacheManager
from ..parser.linux_parser import LinuxManParser
from ..models.document import Document

# Configure logging
logger = logging.getLogger(__name__)


class SimpleJobScheduler:
    """Manages background jobs for BetterMan without database persistence."""

    def __init__(self, db_url: str):
        """Initialize the job scheduler.

        Args:
            db_url: SQLAlchemy database URL
        """
        self.db_url = db_url
        # Use memory job store instead of SQLAlchemy to avoid serialization issues
        self.scheduler = BackgroundScheduler()
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

    def _schedule_jobs(self) -> None:
        """Schedule all maintenance jobs."""
        # Initialize common commands cache - run once at startup and daily at midnight
        self.scheduler.add_job(
            func=prefetch_common_commands,
            trigger=CronTrigger(hour=0, minute=0),
            id="prefetch_common_commands",
            args=[self.db_url],
            replace_existing=True,
        )

        # Update existing common commands - every 12 hours
        self.scheduler.add_job(
            func=update_common_commands,
            trigger=IntervalTrigger(hours=12),
            id="update_common_commands",
            args=[self.db_url],
            replace_existing=True,
        )

        # Update common commands list based on usage - daily at 2am
        self.scheduler.add_job(
            func=update_common_commands_list,
            trigger=CronTrigger(hour=2, minute=0),
            id="update_common_commands_list",
            args=[self.db_url],
            replace_existing=True,
        )

        # Clean up old cache entries - daily at 3am
        self.scheduler.add_job(
            func=clean_cache,
            trigger=CronTrigger(hour=3, minute=0),
            id="clean_cache",
            args=[self.db_url],
            replace_existing=True,
        )

        # Log cache statistics - hourly
        self.scheduler.add_job(
            func=log_cache_statistics,
            trigger=IntervalTrigger(hours=1),
            id="log_cache_statistics",
            args=[self.db_url],
            replace_existing=True,
        )

    def run_job_now(self, job_id: str) -> bool:
        """Run a scheduled job immediately.

        Args:
            job_id: Job identifier

        Returns:
            True if job was run, False if job not found
        """
        job = self.scheduler.get_job(job_id)
        if job:
            job.func(*job.args, **job.kwargs)
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


# Singleton instance
_scheduler_instance = None


def get_scheduler(db_url: Optional[str] = None) -> SimpleJobScheduler:
    """Get the scheduler instance (singleton).

    Args:
        db_url: SQLAlchemy database URL (only used on first call)

    Returns:
        SimpleJobScheduler instance
    """
    global _scheduler_instance
    if _scheduler_instance is None:
        if db_url is None:
            raise ValueError("db_url must be provided on first call")
        _scheduler_instance = SimpleJobScheduler(db_url)
    return _scheduler_instance