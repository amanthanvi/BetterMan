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
from ..parser.linux_parser import LinuxManParser

# Configure logging
logger = logging.getLogger(__name__)


class JobScheduler:
    """Manages background jobs for BetterMan."""

    def __init__(self, db_url: str):
        """Initialize the job scheduler.

        Args:
            db_url: SQLAlchemy database URL
        """
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
            self._prefetch_common_commands,
            "cron",
            hour=0,
            minute=0,
            id="prefetch_common_commands",
            replace_existing=True,
        )

        # Update existing common commands - every 12 hours
        self.scheduler.add_job(
            self._update_common_commands,
            IntervalTrigger(hours=12),
            id="update_common_commands",
            replace_existing=True,
        )

        # Update common commands list based on usage - daily at 2am
        self.scheduler.add_job(
            self._update_common_commands_list,
            "cron",
            hour=2,
            minute=0,
            id="update_common_commands_list",
            replace_existing=True,
        )

        # Clean up old cache entries - daily at 3am
        self.scheduler.add_job(
            self._clean_cache,
            "cron",
            hour=3,
            minute=0,
            id="clean_cache",
            replace_existing=True,
        )

        # Log cache statistics - hourly
        self.scheduler.add_job(
            self._log_cache_statistics,
            IntervalTrigger(hours=1),
            id="log_cache_statistics",
            replace_existing=True,
        )

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
