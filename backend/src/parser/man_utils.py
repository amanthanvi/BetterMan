"""
Utilities for fetching and processing man page content with enhanced security.
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
from pathlib import Path
import string

from .man_loader import ManPageLoader

logger = logging.getLogger(__name__)

# Global loader instance
_man_loader = None

# Security constants
ALLOWED_COMMAND_CHARS = string.ascii_letters + string.digits + '-_.+'
MAX_COMMAND_LENGTH = 50
ALLOWED_SECTIONS = {'1', '2', '3', '4', '5', '6', '7', '8', 'n', 'l'}


def validate_command_name(command_name: str) -> bool:
    """
    Validate command name to prevent injection attacks.
    
    Args:
        command_name: The command name to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not command_name:
        return False
    
    if len(command_name) > MAX_COMMAND_LENGTH:
        return False
    
    # Check if all characters are allowed
    if not all(c in ALLOWED_COMMAND_CHARS for c in command_name):
        return False
    
    # Prevent directory traversal
    if '..' in command_name or '/' in command_name or '\\' in command_name:
        return False
    
    return True


def validate_section(section: Optional[str]) -> bool:
    """
    Validate section number.
    
    Args:
        section: The section to validate
        
    Returns:
        True if valid or None, False otherwise
    """
    if section is None:
        return True
    
    return section in ALLOWED_SECTIONS


def safe_path_join(base_path: str, *paths: str) -> Optional[str]:
    """
    Safely join paths preventing directory traversal.
    
    Args:
        base_path: The base directory path
        paths: Additional path components
        
    Returns:
        Safe joined path or None if unsafe
    """
    try:
        base = Path(base_path).resolve()
        full_path = base.joinpath(*paths).resolve()
        
        # Check if the resolved path is within the base directory
        if base in full_path.parents or base == full_path:
            return str(full_path)
        return None
    except Exception:
        return None


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
    try:
        # Get the man paths safely
        man_paths = []
        
        # Use subprocess with shell=False for security
        result = subprocess.run(
            ["manpath"], 
            capture_output=True, 
            text=True, 
            shell=False,
            timeout=10,
            env=dict(os.environ, PATH="/usr/bin:/bin")  # Restrict PATH
        )
        
        if result.returncode == 0:
            man_paths = result.stdout.strip().split(":")
        else:
            # Fallback to common paths
            man_paths = [
                '/usr/share/man',
                '/usr/local/share/man',
                '/usr/local/man',
                '/opt/man',
            ]

        # Find all man pages
        man_pages = []
        for path in man_paths:
            if not os.path.exists(path) or not os.path.isdir(path):
                continue

            try:
                for section_dir in os.listdir(path):
                    section_match = re.match(r"man([1-8nl])$", section_dir)
                    if not section_match:
                        continue

                    section = section_match.group(1)
                    section_path = safe_path_join(path, section_dir)
                    
                    if not section_path or not os.path.isdir(section_path):
                        continue

                    for filename in os.listdir(section_path):
                        # Validate filename
                        if not filename or len(filename) > 255:
                            continue
                        
                        # Handle compressed files
                        man_name = filename
                        for ext in [".gz", ".bz2", ".xz", ".lzma", ".Z"]:
                            if man_name.endswith(ext):
                                man_name = man_name[: -len(ext)]
                                break

                        # Handle section suffix
                        man_name = re.sub(r"\.\d+$", "", man_name)
                        
                        # Validate the extracted name
                        if validate_command_name(man_name):
                            file_path = safe_path_join(section_path, filename)
                            if file_path:
                                man_pages.append({
                                    "name": man_name,
                                    "section": section,
                                    "path": file_path,
                                })
            except Exception as e:
                logger.warning(f"Error processing directory {path}: {e}")
                continue

        return man_pages
    except Exception as e:
        logger.error(f"Error getting available man pages: {e}")
        return []


def fetch_man_page_content(
    command_name: str, section: Optional[str] = None
) -> Tuple[Optional[str], Optional[str]]:
    """
    Fetch raw man page content for a given command with security validation.
    
    Args:
        command_name: Name of the command/man page
        section: Optional section number (1-8)
        
    Returns:
        Tuple of (content, error_message)
    """
    # Validate inputs
    if not validate_command_name(command_name):
        return None, f"Invalid command name: {command_name}"
    
    if not validate_section(section):
        return None, f"Invalid section: {section}"
    
    # Use the secure loader
    loader = get_man_loader()
    return loader.load_man_page(command_name, section)


def get_raw_man_page(command_name: str, section: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    """
    Get the raw groff source of a man page with enhanced security.
    
    Args:
        command_name: Name of the command/man page
        section: Optional section number (1-8)
        
    Returns:
        Tuple of (content, error_message)
    """
    # Validate inputs
    if not validate_command_name(command_name):
        return None, f"Invalid command name: {command_name}"
    
    if not validate_section(section):
        return None, f"Invalid section: {section}"
    
    # Define safe man paths
    man_paths = [
        '/usr/share/man',
        '/usr/local/share/man',
        '/usr/local/man',
        '/opt/man',
    ]
    
    # Add paths from MANPATH environment variable (validated)
    manpath = os.environ.get('MANPATH', '')
    if manpath:
        for path in manpath.split(':'):
            # Validate each path
            if path and os.path.isabs(path) and os.path.exists(path):
                man_paths.append(path)
    
    # Search for the man page file
    for base_path in man_paths:
        if not os.path.exists(base_path) or not os.path.isdir(base_path):
            continue
            
        # Try different section directories
        sections = [section] if section else list(ALLOWED_SECTIONS)
        
        for sec in sections:
            # Build safe file patterns
            filenames = [
                f"{command_name}.{sec}",
                f"{command_name}.{sec}.gz",
                f"{command_name}.{sec}.bz2",
                f"{command_name}.{sec}.xz",
            ]
            
            for filename in filenames:
                # Use safe path join
                file_path = safe_path_join(base_path, f"man{sec}", filename)
                if not file_path:
                    continue
                
                if os.path.exists(file_path) and os.path.isfile(file_path):
                    try:
                        # Read the file based on extension
                        if file_path.endswith('.gz'):
                            with gzip.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                                content = f.read()
                        elif file_path.endswith('.bz2'):
                            with bz2.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                                content = f.read()
                        elif file_path.endswith('.xz'):
                            with lzma.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                                content = f.read()
                        else:
                            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                                content = f.read()
                        
                        # Validate content size to prevent DoS
                        if len(content) > 10 * 1024 * 1024:  # 10MB limit
                            return None, "Man page too large"
                        
                        return content, None
                        
                    except Exception as e:
                        logger.error(f"Error reading man page file {file_path}: {e}")
                        continue
    
    # If direct file access fails, try using man -w to find the path (with security)
    try:
        # Build safe command
        cmd = ['man', '-w']
        if section:
            cmd.extend(['-s', section])
        cmd.append(command_name)
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=5,
            shell=False,  # Never use shell=True
            env=dict(os.environ, PATH="/usr/bin:/bin")  # Restrict PATH
        )
        
        if result.returncode == 0 and result.stdout:
            file_path = result.stdout.strip()
            
            # Validate the returned path
            if not os.path.isabs(file_path):
                return None, "Invalid man page path returned"
            
            # Check if path is within allowed directories
            allowed = False
            for allowed_path in man_paths:
                if file_path.startswith(allowed_path + os.sep):
                    allowed = True
                    break
            
            if not allowed:
                return None, "Man page path outside allowed directories"
            
            if os.path.exists(file_path) and os.path.isfile(file_path):
                try:
                    if file_path.endswith('.gz'):
                        with gzip.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                            content = f.read()
                    elif file_path.endswith('.bz2'):
                        with bz2.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                            content = f.read()
                    elif file_path.endswith('.xz'):
                        with lzma.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                            content = f.read()
                    else:
                        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                            content = f.read()
                    
                    # Validate content size
                    if len(content) > 10 * 1024 * 1024:  # 10MB limit
                        return None, "Man page too large"
                    
                    return content, None
                    
                except Exception as e:
                    logger.error(f"Error reading man page file {file_path}: {e}")
                    return None, f"Error reading man page: {str(e)}"
    except subprocess.TimeoutExpired:
        return None, "Man page lookup timed out"
    except Exception as e:
        logger.error(f"Error running man command: {e}")
    
    # Fall back to formatted output
    return fetch_man_page_content(command_name, section)