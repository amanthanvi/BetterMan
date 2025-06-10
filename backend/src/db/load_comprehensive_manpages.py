#!/usr/bin/env python3
"""
Comprehensive script to load ALL real man pages from the Linux system into the database.
Uses the comprehensive discovery and batch loading system with progress tracking.
"""

import os
import sys
import asyncio
import argparse
import logging
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Tuple

# Add the parent directory to Python path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session
from sqlalchemy import text
from src.db.session import engine, get_db, SessionLocal
from src.models.document import Document, Base
from src.parser.comprehensive_loader import ComprehensiveBatchLoader
from src.parser.comprehensive_discovery import ComprehensiveManPageDiscovery
from src.parser.enhanced_groff_parser import EnhancedGroffParser
from src.parser.man_loader import ManPageLoader
from src.cache.cache_manager import CacheManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('comprehensive_loading.log')
    ]
)
logger = logging.getLogger(__name__)


class ComprehensiveManPageLoader:
    """Main loader for comprehensive man page loading."""
    
    def __init__(self):
        self.loader = ManPageLoader()
        self.parser = EnhancedGroffParser()
        self.discovery = ComprehensiveManPageDiscovery(max_workers=8)
        self.batch_loader = ComprehensiveBatchLoader(
            batch_size=100,
            max_workers=8,
            memory_limit_mb=2048,
            enable_parallel_processing=True,
            enable_caching=True
        )
        self.stats = {
            'total_discovered': 0,
            'total_processed': 0,
            'successful': 0,
            'failed': 0,
            'skipped': 0,
            'errors': [],
            'start_time': None,
            'end_time': None
        }
        
    async def load_all_manpages(
        self,
        sections: Optional[List[str]] = None,
        priority_range: Optional[Tuple[int, int]] = None,
        dry_run: bool = False,
        resume_session: Optional[str] = None
    ):
        """
        Load all man pages from the system.
        
        Args:
            sections: Optional list of sections to load (e.g., ['1', '2', '3'])
            priority_range: Optional tuple of (min_priority, max_priority)
            dry_run: If True, only discover and report, don't actually load
            resume_session: Optional session ID to resume from
        """
        self.stats['start_time'] = datetime.now()
        logger.info("=" * 80)
        logger.info("Starting comprehensive man page loading")
        logger.info("=" * 80)
        
        try:
            # Initialize database
            Base.metadata.create_all(bind=engine)
            
            # Clear existing data if not resuming
            if not resume_session and not dry_run:
                if await self._confirm_clear_existing():
                    await self._clear_existing_data()
            
            # Start the batch loading process
            progress_count = 0
            async for update in self.batch_loader.load_all_man_pages(
                priority_range=priority_range,
                sections_filter=sections,
                resume_session=resume_session,
                dry_run=dry_run
            ):
                progress_count += 1
                
                if update['type'] == 'progress':
                    self._display_progress(update)
                    
                    # Save progress periodically
                    if progress_count % 100 == 0:
                        await self._save_progress_checkpoint(update)
                        
                elif update['type'] == 'dry_run':
                    self._display_dry_run_results(update)
                    
                elif update['type'] == 'completion':
                    self._display_completion(update)
                    
        except KeyboardInterrupt:
            logger.warning("\nLoading interrupted by user")
            self.stats['end_time'] = datetime.now()
            self._display_final_stats()
            
        except Exception as e:
            logger.error(f"Fatal error during loading: {e}", exc_info=True)
            self.stats['end_time'] = datetime.now()
            self._display_final_stats()
            raise
            
        finally:
            self.stats['end_time'] = datetime.now()
            
    def _display_progress(self, update: dict):
        """Display progress update."""
        overall = update['overall_progress']
        section = update['section']
        batch = update['batch']
        
        # Clear line and display progress
        progress_bar = self._create_progress_bar(overall['percentage'])
        
        logger.info(
            f"\r[{progress_bar}] {overall['percentage']:.1f}% | "
            f"Section: {section} | "
            f"Processed: {overall['processed']:,}/{overall['total']:,} | "
            f"Success: {overall['success_rate']:.1f}% | "
            f"ETA: {self._format_eta(overall.get('eta_seconds'))}"
        )
        
        # Log batch details at debug level
        logger.debug(
            f"Batch {batch['number']}/{batch['total_batches']}: "
            f"Success: {batch['success']}, Errors: {batch['errors']}, "
            f"Skipped: {batch['skipped']}"
        )
        
    def _create_progress_bar(self, percentage: float, width: int = 40) -> str:
        """Create a text progress bar."""
        filled = int(width * percentage / 100)
        bar = '█' * filled + '░' * (width - filled)
        return bar
        
    def _format_eta(self, eta_seconds: Optional[float]) -> str:
        """Format ETA in human-readable form."""
        if eta_seconds is None:
            return "Unknown"
            
        hours = int(eta_seconds // 3600)
        minutes = int((eta_seconds % 3600) // 60)
        seconds = int(eta_seconds % 60)
        
        if hours > 0:
            return f"{hours}h {minutes}m"
        elif minutes > 0:
            return f"{minutes}m {seconds}s"
        else:
            return f"{seconds}s"
            
    def _display_dry_run_results(self, update: dict):
        """Display dry run results."""
        logger.info("\n" + "=" * 80)
        logger.info("DRY RUN RESULTS")
        logger.info("=" * 80)
        logger.info(f"Total pages discovered: {update['total_pages']:,}")
        logger.info(f"Total sections: {update['sections']}")
        logger.info("\nBreakdown by section:")
        
        for section, count in sorted(update['breakdown'].items()):
            logger.info(f"  Section {section}: {count:,} pages")
            
        logger.info("\nNo changes were made to the database (dry run mode)")
        
    def _display_completion(self, update: dict):
        """Display completion summary."""
        session = update['session']
        discovery_stats = update.get('discovery_stats', {})
        
        logger.info("\n" + "=" * 80)
        logger.info("LOADING COMPLETED")
        logger.info("=" * 80)
        
        logger.info(f"Session ID: {session['session_id']}")
        logger.info(f"Duration: {session['duration']:.1f} seconds")
        logger.info(f"Total pages processed: {session['pages_processed']:,}")
        logger.info(f"Successful: {session['pages_success']:,}")
        logger.info(f"Failed: {session['pages_error']:,}")
        logger.info(f"Skipped: {session['pages_skipped']:,}")
        logger.info(f"Success rate: {session['success_rate']:.1f}%")
        
        if discovery_stats:
            logger.info("\nDiscovery statistics:")
            logger.info(f"  Paths scanned: {discovery_stats.get('paths_scanned', 0)}")
            logger.info(f"  Sections found: {len(discovery_stats.get('sections_found', []))}")
            logger.info(f"  Total files checked: {discovery_stats.get('total_files', 0)}")
            
    def _display_final_stats(self):
        """Display final statistics."""
        if self.stats['start_time'] and self.stats['end_time']:
            duration = (self.stats['end_time'] - self.stats['start_time']).total_seconds()
            
            logger.info("\n" + "=" * 80)
            logger.info("FINAL STATISTICS")
            logger.info("=" * 80)
            logger.info(f"Total duration: {duration:.1f} seconds")
            logger.info(f"Pages discovered: {self.stats['total_discovered']:,}")
            logger.info(f"Pages processed: {self.stats['total_processed']:,}")
            logger.info(f"Successful: {self.stats['successful']:,}")
            logger.info(f"Failed: {self.stats['failed']:,}")
            logger.info(f"Skipped: {self.stats['skipped']:,}")
            
            if self.stats['errors']:
                logger.info(f"\nFirst 10 errors:")
                for error in self.stats['errors'][:10]:
                    logger.info(f"  - {error}")
                    
    async def _confirm_clear_existing(self) -> bool:
        """Confirm clearing existing data."""
        db = SessionLocal()
        try:
            count = db.query(Document).count()
            if count > 0:
                logger.warning(f"\nWARNING: Database contains {count} existing documents.")
                response = input("Do you want to clear existing data? (yes/no): ")
                return response.lower() == 'yes'
            return False
        finally:
            db.close()
            
    async def _clear_existing_data(self):
        """Clear existing man page data."""
        logger.info("Clearing existing man page data...")
        db = SessionLocal()
        try:
            db.query(Document).delete()
            db.commit()
            logger.info("Existing data cleared")
        except Exception as e:
            db.rollback()
            logger.error(f"Error clearing data: {e}")
            raise
        finally:
            db.close()
            
    async def _save_progress_checkpoint(self, update: dict):
        """Save progress checkpoint to file."""
        checkpoint_file = Path("loading_checkpoint.json")
        try:
            with open(checkpoint_file, 'w') as f:
                json.dump({
                    'timestamp': datetime.now().isoformat(),
                    'session_id': update['session_id'],
                    'progress': update['overall_progress'],
                    'current_section': update['section']
                }, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving checkpoint: {e}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Load all man pages from the Linux system into the database"
    )
    parser.add_argument(
        '--sections', 
        nargs='+',
        help='Specific sections to load (e.g., 1 2 3)'
    )
    parser.add_argument(
        '--priority-min',
        type=int,
        default=1,
        help='Minimum priority level (1-8, default: 1)'
    )
    parser.add_argument(
        '--priority-max',
        type=int,
        default=8,
        help='Maximum priority level (1-8, default: 8)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Only discover and report, do not load'
    )
    parser.add_argument(
        '--resume',
        type=str,
        help='Resume from a previous session ID'
    )
    
    args = parser.parse_args()
    
    # Create the loader
    loader = ComprehensiveManPageLoader()
    
    # Run the async loading process
    asyncio.run(loader.load_all_manpages(
        sections=args.sections,
        priority_range=(args.priority_min, args.priority_max),
        dry_run=args.dry_run,
        resume_session=args.resume
    ))


if __name__ == "__main__":
    main()