"""
Security validator for comprehensive man page operations.
Ensures safe processing of all Linux man pages with security-first approach.
"""

import re
import os
from typing import Set, List, Optional, Tuple
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class ManPageSecurityValidator:
    """Enhanced security validation for comprehensive man page operations."""
    
    # Whitelist of allowed man page sections (comprehensive)
    ALLOWED_SECTIONS = {
        '1', '2', '3', '4', '5', '6', '7', '8',  # Standard sections
        'n', 'l',  # New and local commands
        '0p', '1p', '3p',  # POSIX man pages
        '3pm', '3perl',  # Perl modules
        '3x', '3tcl',  # Extension pages
        '1m', '1s', '7d', '7i', '7m', '7p',  # System-specific sections
        '1ssl', '3ssl', '5ssl', '7ssl',  # OpenSSL sections
        '1x', '3x', '5x', '7x',  # X Window System
    }
    
    # Core system commands that should always be available (expanded)
    CORE_COMMANDS = {
        # File operations
        'ls', 'cd', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'chmod', 'chown', 'chgrp',
        'touch', 'ln', 'readlink', 'stat', 'file', 'dd', 'sync',
        
        # Text processing
        'cat', 'less', 'more', 'head', 'tail', 'grep', 'sed', 'awk', 'cut', 'sort',
        'uniq', 'wc', 'tr', 'fold', 'split', 'paste', 'join', 'comm', 'diff', 'patch',
        
        # File searching
        'find', 'locate', 'which', 'whereis', 'type', 'command',
        
        # Process management
        'ps', 'top', 'htop', 'kill', 'killall', 'pkill', 'pgrep', 'jobs', 'fg', 'bg',
        'nohup', 'nice', 'renice', 'time', 'timeout',
        
        # Archive and compression
        'tar', 'gzip', 'gunzip', 'bzip2', 'bunzip2', 'xz', 'unxz', 'zip', 'unzip',
        '7z', 'ar', 'cpio',
        
        # Network utilities
        'ssh', 'scp', 'rsync', 'curl', 'wget', 'ping', 'traceroute', 'netstat',
        'ss', 'ip', 'ifconfig', 'route', 'dig', 'nslookup', 'host',
        
        # Version control
        'git', 'svn', 'hg', 'cvs',
        
        # Editors
        'vim', 'vi', 'nano', 'emacs', 'ed', 'pico',
        
        # System information
        'uname', 'hostname', 'uptime', 'date', 'cal', 'who', 'whoami', 'id',
        'groups', 'users', 'w', 'last', 'history',
        
        # Documentation
        'man', 'info', 'help', 'apropos', 'whatis',
    }
    
    # Sensitive commands to handle with extra care (not excluded, but monitored)
    SENSITIVE_COMMANDS = {
        'sudo', 'su', 'passwd', 'shadow', 'crypt', 'adduser', 'useradd', 'userdel',
        'mount', 'umount', 'fdisk', 'mkfs', 'fsck', 'parted',
        'iptables', 'firewall-cmd', 'ufw', 'selinux', 'apparmor',
        'systemctl', 'service', 'init', 'shutdown', 'reboot', 'poweroff',
    }
    
    # File extensions that might contain man pages
    VALID_EXTENSIONS = {
        '', '.gz', '.bz2', '.xz', '.Z', '.lzma', '.zst',
        '.1', '.2', '.3', '.4', '.5', '.6', '.7', '.8',
        '.man', '.txt', '.doc',
    }
    
    @classmethod
    def validate_command_name(cls, command: str, strict: bool = False) -> Tuple[bool, Optional[str]]:
        """
        Validate command name with enhanced security.
        
        Args:
            command: Command name to validate
            strict: If True, apply stricter validation rules
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not command:
            return False, "Empty command name"
            
        if len(command) > 255:
            return False, f"Command name too long: {len(command)} > 255"
        
        # Check for path traversal attempts
        if '..' in command or '/' in command or '\\' in command:
            return False, "Path traversal attempt detected"
        
        # Check for null bytes or control characters
        if '\x00' in command or any(ord(c) < 32 for c in command):
            return False, "Invalid characters in command name"
        
        # Allow more flexible naming for comprehensive coverage
        if strict:
            # Strict mode: alphanumeric, dash, underscore, dot, plus
            if not re.match(r'^[a-zA-Z0-9._+-]+$', command):
                return False, "Invalid characters (strict mode)"
        else:
            # Comprehensive mode: allow more characters but still safe
            if not re.match(r'^[a-zA-Z0-9._+:@-]+$', command):
                return False, "Invalid characters in command name"
        
        # Check if it's a sensitive command
        if command.lower() in cls.SENSITIVE_COMMANDS:
            logger.warning(f"Processing sensitive command: {command}")
        
        return True, None
    
    @classmethod
    def validate_section(cls, section: str) -> bool:
        """Validate man page section."""
        if not section:
            return False
            
        # Allow standard sections and subsections
        base_section = section.split('.')[0] if '.' in section else section
        return base_section in cls.ALLOWED_SECTIONS
    
    @classmethod
    def validate_file_path(cls, file_path: str) -> Tuple[bool, Optional[str]]:
        """
        Validate file path for security.
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            path = Path(file_path)
            
            # Must be absolute path
            if not path.is_absolute():
                return False, "Path must be absolute"
            
            # Check if path exists and is a file
            if not path.exists():
                return False, "Path does not exist"
                
            if not path.is_file():
                return False, "Path is not a file"
            
            # Check if readable
            if not os.access(str(path), os.R_OK):
                return False, "File is not readable"
            
            # Check file size (max 10MB for man pages)
            if path.stat().st_size > 10 * 1024 * 1024:
                return False, "File too large (>10MB)"
            
            # Validate file extension
            valid_ext = False
            for ext in cls.VALID_EXTENSIONS:
                if str(path).endswith(ext):
                    valid_ext = True
                    break
            
            if not valid_ext and not any(str(path).endswith(f".{s}") for s in cls.ALLOWED_SECTIONS):
                logger.warning(f"Unusual file extension: {path}")
            
            return True, None
            
        except Exception as e:
            return False, f"Path validation error: {str(e)}"
    
    @classmethod
    def get_safe_man_paths(cls) -> List[str]:
        """Get validated man page paths for comprehensive coverage."""
        potential_paths = [
            # Standard paths
            '/usr/share/man',
            '/usr/local/share/man',
            '/usr/local/man',
            '/opt/local/share/man',
            
            # System-specific paths
            '/usr/X11R6/man',
            '/usr/pkg/man',
            '/usr/contrib/man',
            '/usr/kerberos/man',
            
            # Application-specific paths
            '/usr/share/*/man',
            '/opt/*/man',
            '/opt/*/share/man',
            
            # Development tools
            '/usr/lib/go*/share/man',
            '/usr/lib/node_modules/*/man',
            '/usr/lib/python*/share/man',
            
            # Database and server software
            '/usr/pgsql-*/share/man',
            '/usr/mysql/*/man',
            
            # Additional software collections
            '/usr/share/doc/*/man',
            '/var/lib/*/man',
        ]
        
        validated_paths = []
        seen = set()
        
        for pattern in potential_paths:
            if '*' in pattern:
                # Handle glob patterns
                import glob
                for path in glob.glob(pattern):
                    if path not in seen and cls._validate_man_directory(path):
                        validated_paths.append(path)
                        seen.add(path)
            else:
                # Direct path
                if pattern not in seen and cls._validate_man_directory(pattern):
                    validated_paths.append(pattern)
                    seen.add(pattern)
        
        logger.info(f"Found {len(validated_paths)} valid man directories")
        return sorted(validated_paths)
    
    @classmethod
    def _validate_man_directory(cls, path: str) -> bool:
        """Validate a potential man directory."""
        try:
            if not os.path.exists(path):
                return False
                
            if not os.path.isdir(path):
                return False
                
            if not os.access(path, os.R_OK | os.X_OK):
                return False
            
            # Check for at least one man section subdirectory
            entries = os.listdir(path)
            for entry in entries:
                if re.match(r'^man[0-9nl]', entry):
                    subdir = os.path.join(path, entry)
                    if os.path.isdir(subdir):
                        return True
            
            return False
            
        except Exception:
            return False
    
    @classmethod
    def sanitize_content(cls, content: str, max_size: int = 5 * 1024 * 1024) -> str:
        """
        Sanitize man page content for safe processing.
        
        Args:
            content: Raw content to sanitize
            max_size: Maximum allowed size in bytes
            
        Returns:
            Sanitized content
        """
        if not content:
            return ""
        
        # Truncate if too large
        if len(content) > max_size:
            logger.warning(f"Content truncated from {len(content)} to {max_size} bytes")
            content = content[:max_size]
        
        # Remove null bytes
        content = content.replace('\x00', '')
        
        # Ensure valid UTF-8 (replace invalid sequences)
        try:
            content = content.encode('utf-8', errors='replace').decode('utf-8')
        except Exception:
            # Fallback to ASCII
            content = content.encode('ascii', errors='replace').decode('ascii')
        
        return content
    
    @classmethod
    def is_safe_to_process(cls, file_info: dict) -> Tuple[bool, Optional[str]]:
        """
        Comprehensive safety check for a file.
        
        Args:
            file_info: Dictionary with file information
            
        Returns:
            Tuple of (is_safe, reason_if_not_safe)
        """
        # Validate command name
        is_valid, error = cls.validate_command_name(file_info.get('command', ''))
        if not is_valid:
            return False, f"Invalid command: {error}"
        
        # Validate section
        if not cls.validate_section(file_info.get('section', '')):
            return False, "Invalid section"
        
        # Validate file path
        is_valid, error = cls.validate_file_path(file_info.get('path', ''))
        if not is_valid:
            return False, f"Invalid path: {error}"
        
        return True, None