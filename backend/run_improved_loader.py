#!/usr/bin/env python3
"""
Run the improved man page loader.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.parser.improved_loader import ImprovedManPageLoader
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

if __name__ == "__main__":
    loader = ImprovedManPageLoader()
    
    # Load man pages for common sections
    sections = ['1', '2', '3', '5', '8']  # Common user commands, system calls, library functions, file formats, admin
    
    print("Starting improved man page loading...")
    stats = loader.load_man_pages(sections=sections, batch_size=50, max_workers=4)
    
    print(f"\nLoading complete!")
    print(f"Total found: {stats['total_found']}")
    print(f"Processed: {stats['processed']}")
    print(f"Errors: {stats['errors']}")
    print(f"Skipped: {stats['skipped']}")