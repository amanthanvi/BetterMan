"""
Production-ready man page loader that can import from various sources.
"""

import os
import re
import gzip
import bz2
import lzma
import subprocess
import logging
from typing import List, Dict, Optional, Tuple
from pathlib import Path
import shutil

logger = logging.getLogger(__name__)


class ManPageLoader:
    """Loader for importing man pages from various sources."""
    
    # Standard man page locations on Linux systems
    MAN_PATHS = [
        '/usr/share/man',
        '/usr/local/share/man',
        '/usr/local/man',
        '/opt/man',
        '/snap/man',
        '/var/cache/man',
    ]
    
    # Common man page sections
    SECTIONS = {
        '1': 'User Commands',
        '2': 'System Calls',
        '3': 'C Library Functions',
        '4': 'Devices and Special Files',
        '5': 'File Formats and Conventions',
        '6': 'Games et. al.',
        '7': 'Miscellanea',
        '8': 'System Administration',
        'n': 'New Commands',
        'l': 'Local Commands',
    }
    
    def __init__(self):
        """Initialize the man page loader."""
        self.available_paths = self._find_man_paths()
        
    def _find_man_paths(self) -> List[str]:
        """Find available man page directories on the system."""
        paths = []
        
        # Check standard paths
        for path in self.MAN_PATHS:
            if os.path.exists(path) and os.path.isdir(path):
                paths.append(path)
                
        # Check MANPATH environment variable
        manpath = os.environ.get('MANPATH', '')
        if manpath:
            for path in manpath.split(':'):
                if path and os.path.exists(path) and os.path.isdir(path):
                    if path not in paths:
                        paths.append(path)
                        
        # Try to get paths from manpath command
        try:
            result = subprocess.run(
                ['manpath'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and result.stdout:
                for path in result.stdout.strip().split(':'):
                    if path and os.path.exists(path) and os.path.isdir(path):
                        if path not in paths:
                            paths.append(path)
        except Exception:
            pass
            
        logger.info(f"Found {len(paths)} man page directories")
        return paths
    
    def list_available_pages(self, section: Optional[str] = None) -> List[Dict[str, str]]:
        """
        List all available man pages on the system.
        
        Args:
            section: Optional section to filter by
            
        Returns:
            List of dictionaries with man page info
        """
        pages = []
        seen = set()  # Track seen pages to avoid duplicates
        
        for base_path in self.available_paths:
            # Look for section directories
            for item in os.listdir(base_path):
                path = os.path.join(base_path, item)
                
                # Check if it's a man section directory
                match = re.match(r'^man([1-8nl])$', item)
                if match and os.path.isdir(path):
                    sec = match.group(1)
                    
                    # Skip if filtering by section and doesn't match
                    if section and section != sec:
                        continue
                        
                    # List files in section directory
                    for filename in os.listdir(path):
                        # Extract command name from filename
                        name = self._extract_command_name(filename)
                        if name and name not in seen:
                            seen.add(name)
                            pages.append({
                                'name': name,
                                'section': sec,
                                'path': os.path.join(path, filename),
                                'description': self.SECTIONS.get(sec, 'Unknown')
                            })
                            
        return sorted(pages, key=lambda x: (x['name'], x['section']))
    
    def _extract_command_name(self, filename: str) -> Optional[str]:
        """Extract command name from man page filename."""
        # Remove compression extensions
        name = filename
        for ext in ['.gz', '.bz2', '.xz', '.lzma', '.Z']:
            if name.endswith(ext):
                name = name[:-len(ext)]
                
        # Remove section number
        match = re.match(r'^(.+)\.([1-8nl])$', name)
        if match:
            return match.group(1)
            
        return None
    
    def find_man_page(self, command: str, section: Optional[str] = None) -> Optional[str]:
        """
        Find the path to a man page file.
        
        Args:
            command: Command name
            section: Optional section number
            
        Returns:
            Path to man page file or None
        """
        sections_to_check = [section] if section else ['1', '8', '2', '3', '4', '5', '6', '7', 'n', 'l']
        
        for base_path in self.available_paths:
            for sec in sections_to_check:
                section_dir = os.path.join(base_path, f'man{sec}')
                if not os.path.exists(section_dir):
                    continue
                    
                # Try different file patterns
                patterns = [
                    f"{command}.{sec}",
                    f"{command}.{sec}.gz",
                    f"{command}.{sec}.bz2",
                    f"{command}.{sec}.xz",
                    f"{command}.{sec}.lzma",
                    f"{command}.{sec}.Z",
                ]
                
                for pattern in patterns:
                    filepath = os.path.join(section_dir, pattern)
                    if os.path.exists(filepath):
                        return filepath
                        
        # Try using man -w as fallback
        try:
            cmd = ['man', '-w']
            if section:
                cmd.extend(['-s', section])
            cmd.append(command)
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0 and result.stdout:
                path = result.stdout.strip()
                if os.path.exists(path):
                    return path
        except Exception:
            pass
            
        return None
    
    def load_man_page(self, command: str, section: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
        """
        Load man page content.
        
        Args:
            command: Command name
            section: Optional section number
            
        Returns:
            Tuple of (content, error_message)
        """
        # First try to find the man page file
        filepath = self.find_man_page(command, section)
        
        if filepath:
            try:
                # Read the file based on compression
                content = self._read_man_file(filepath)
                if content:
                    return content, None
            except Exception as e:
                logger.error(f"Error reading man file {filepath}: {e}")
                
        # Fallback to using man command
        return self._load_with_man_command(command, section)
    
    def _read_man_file(self, filepath: str) -> Optional[str]:
        """Read content from man page file."""
        try:
            if filepath.endswith('.gz'):
                with gzip.open(filepath, 'rt', encoding='utf-8', errors='replace') as f:
                    return f.read()
            elif filepath.endswith('.bz2'):
                with bz2.open(filepath, 'rt', encoding='utf-8', errors='replace') as f:
                    return f.read()
            elif filepath.endswith(('.xz', '.lzma')):
                with lzma.open(filepath, 'rt', encoding='utf-8', errors='replace') as f:
                    return f.read()
            else:
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    return f.read()
        except Exception as e:
            logger.error(f"Error reading file {filepath}: {e}")
            return None
    
    def _load_with_man_command(
        self, 
        command: str, 
        section: Optional[str] = None
    ) -> Tuple[Optional[str], Optional[str]]:
        """Load man page using man command."""
        if not shutil.which('man'):
            return None, "man command not found"
            
        try:
            # Build command
            cmd = ['man', '--no-hyphenation', '--no-justification']
            
            if section:
                cmd.extend(['-s', str(section)])
                
            cmd.append(command)
            
            # Set environment for consistent output
            env = os.environ.copy()
            env['LANG'] = 'C.UTF-8'
            env['LC_ALL'] = 'C.UTF-8'
            env['MANWIDTH'] = '80'
            
            # Execute command
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10,
                env=env
            )
            
            if result.returncode == 0:
                content = result.stdout
                if content and len(content.strip()) > 10:
                    return content, None
                else:
                    return None, f"No content found for {command}"
            else:
                error_msg = result.stderr.strip() if result.stderr else f"man exited with code {result.returncode}"
                return None, error_msg
                
        except subprocess.TimeoutExpired:
            return None, "Timeout while loading man page"
        except Exception as e:
            return None, f"Error loading man page: {str(e)}"
    
    def import_all_common_commands(self) -> Dict[str, bool]:
        """
        Import all common Unix commands.
        
        Returns:
            Dictionary mapping command names to success status
        """
        common_commands = [
            # File operations
            'ls', 'cd', 'pwd', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch',
            'cat', 'less', 'more', 'head', 'tail', 'echo', 'tee',
            
            # File permissions
            'chmod', 'chown', 'chgrp', 'umask',
            
            # Process management
            'ps', 'top', 'htop', 'kill', 'killall', 'jobs', 'bg', 'fg',
            
            # Text processing
            'grep', 'sed', 'awk', 'cut', 'sort', 'uniq', 'wc', 'tr',
            
            # Archive/Compression
            'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'bzip2', 'bunzip2',
            
            # Network
            'ping', 'curl', 'wget', 'ssh', 'scp', 'rsync', 'netstat', 'ss',
            
            # System info
            'df', 'du', 'free', 'uname', 'hostname', 'whoami', 'date', 'uptime',
            
            # Package management
            'apt', 'apt-get', 'dpkg', 'yum', 'rpm', 'snap',
            
            # Development
            'git', 'make', 'gcc', 'python', 'pip', 'node', 'npm',
            
            # Shell
            'bash', 'sh', 'zsh', 'fish', 'source', 'export', 'alias',
        ]
        
        results = {}
        for command in common_commands:
            content, error = self.load_man_page(command)
            results[command] = content is not None
            if error:
                logger.debug(f"Failed to load {command}: {error}")
                
        return results
    
    def get_raw_groff(self, command: str, section: Optional[str] = None) -> Optional[str]:
        """
        Get raw groff/troff source for a man page.
        
        Args:
            command: Command name
            section: Optional section number
            
        Returns:
            Raw groff content or None
        """
        filepath = self.find_man_page(command, section)
        
        if filepath:
            content = self._read_man_file(filepath)
            # Check if it's groff source (starts with dot commands)
            if content and (content.startswith('.') or '.TH' in content[:100]):
                return content
                
        return None