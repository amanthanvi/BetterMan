"""
Utilities for fetching and processing man page content.
"""

import subprocess
import os
import logging
from typing import Optional, List, Dict, Tuple
import re
import shutil
import gzip
import bz2
import lzma

from .man_loader import ManPageLoader

logger = logging.getLogger(__name__)

# Global loader instance
_man_loader = None

def get_man_loader() -> ManPageLoader:
    """Get global man page loader instance."""
    global _man_loader
    if _man_loader is None:
        _man_loader = ManPageLoader()
    return _man_loader


def get_available_man_pages() -> List[Dict[str, str]]:
    """
    Get a list of available man pages on the system.

    Returns:
        List of dictionaries containing man page information.
    """
    # This implementation is Linux/Unix specific
    try:
        # Get the man paths
        man_paths = []
        man_path_output = subprocess.run(
            ["manpath"], capture_output=True, text=True, check=True
        ).stdout.strip()
        man_paths = man_path_output.split(":")

        # Find all man pages
        man_pages = []
        for path in man_paths:
            if not os.path.exists(path):
                continue

            for section_dir in os.listdir(path):
                section_match = re.match(r"man(\d+)", section_dir)
                if not section_match:
                    continue

                section = section_match.group(1)
                section_path = os.path.join(path, section_dir)

                if not os.path.isdir(section_path):
                    continue

                for filename in os.listdir(section_path):
                    # Handle compressed files (.gz, .bz2, etc.)
                    man_name = filename
                    for ext in [".gz", ".bz2", ".xz", ".lzma", ".Z"]:
                        if man_name.endswith(ext):
                            man_name = man_name[: -len(ext)]
                            break

                    # Handle section suffix (.1, .2, etc.)
                    man_name = re.sub(r"\.\d+$", "", man_name)

                    man_pages.append(
                        {
                            "name": man_name,
                            "section": section,
                            "path": os.path.join(section_path, filename),
                        }
                    )

        return man_pages
    except Exception as e:
        print(f"Error getting available man pages: {e}")
        return []


def fetch_man_page_content(
    command_name: str, section: Optional[str] = None
) -> Tuple[Optional[str], Optional[str]]:
    """
    Fetch raw man page content for a given command.
    
    Args:
        command_name: Name of the command/man page
        section: Optional section number (1-8)
        
    Returns:
        Tuple of (content, error_message)
    """
    # Sanitize input to prevent command injection
    if not command_name or not command_name.replace('-', '').replace('_', '').replace('.', '').isalnum():
        return None, f"Invalid command name: {command_name}"
    
    # Use the new loader
    loader = get_man_loader()
    return loader.load_man_page(command_name, section)


def get_raw_man_page(command_name: str, section: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    """
    Get the raw groff source of a man page.
    
    Args:
        command_name: Name of the command/man page
        section: Optional section number (1-8)
        
    Returns:
        Tuple of (content, error_message)
    """
    # First try to find the man page file directly
    man_paths = [
        '/usr/share/man',
        '/usr/local/share/man',
        '/usr/local/man',
        '/opt/man',
    ]
    
    # Add paths from MANPATH environment variable
    manpath = os.environ.get('MANPATH', '')
    if manpath:
        man_paths.extend(manpath.split(':'))
    
    # Search for the man page file
    for base_path in man_paths:
        if not os.path.exists(base_path):
            continue
            
        # Try different section directories
        sections = [section] if section else ['1', '2', '3', '4', '5', '6', '7', '8', 'n', 'l']
        
        for sec in sections:
            # Try different file patterns
            patterns = [
                f"man{sec}/{command_name}.{sec}",
                f"man{sec}/{command_name}.{sec}.gz",
                f"man{sec}/{command_name}.{sec}.bz2",
                f"man{sec}/{command_name}.{sec}.xz",
            ]
            
            for pattern in patterns:
                file_path = os.path.join(base_path, pattern)
                if os.path.exists(file_path):
                    try:
                        # Read the file based on extension
                        if file_path.endswith('.gz'):
                            with gzip.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                                return f.read(), None
                        elif file_path.endswith('.bz2'):
                            with bz2.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                                return f.read(), None
                        elif file_path.endswith('.xz'):
                            with lzma.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                                return f.read(), None
                        else:
                            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                                return f.read(), None
                    except Exception as e:
                        logger.error(f"Error reading man page file {file_path}: {e}")
                        continue
    
    # If direct file access fails, try using man -w to find the path
    try:
        result = subprocess.run(
            ['man', '-w', command_name],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0 and result.stdout:
            file_path = result.stdout.strip()
            try:
                if file_path.endswith('.gz'):
                    with gzip.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                        return f.read(), None
                elif file_path.endswith('.bz2'):
                    with bz2.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                        return f.read(), None
                elif file_path.endswith('.xz'):
                    with lzma.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                        return f.read(), None
                else:
                    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                        return f.read(), None
            except Exception as e:
                logger.error(f"Error reading man page file {file_path}: {e}")
    except:
        pass
    
    # Fall back to formatted output
    return fetch_man_page_content(command_name, section)
