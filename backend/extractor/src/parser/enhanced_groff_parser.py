"""
Enhanced groff parser for complete removal of groff/troff formatting.

This module provides comprehensive parsing and cleaning of groff/troff
formatting commands commonly found in man pages.
"""

import re
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class EnhancedGroffParser:
    """Enhanced parser for complete groff/troff formatting removal."""
    
    # Common escape sequences
    ESCAPE_SEQUENCES = {
        r'\-': '-',      # Hyphen
        r'\ ': ' ',      # Non-breaking space  
        r'\e': '\\',     # Backslash
        r'\&': '',       # Zero-width space
        r'\(aq': "'",    # Apostrophe
        r'\(cq': "'",    # Closing quote
        r'\(oq': "'",    # Opening quote
        r'\(dq': '"',    # Double quote
        r'\(em': '—',    # Em dash
        r'\(en': '–',    # En dash
        r'\(bu': '•',    # Bullet
        r'\(co': '©',    # Copyright
        r'\(rg': '®',    # Registered
        r'\(tm': '™',    # Trademark
        r'\*(': '',      # String interpolation start (we'll handle these specially)
        r'\[char46]': '.', # Period
        r'\~': ' ',      # Non-breaking space
        r'\0': ' ',      # Digit-width space
        r'\|': '',       # Sixth-em space
        r'\^': '',       # Half-em space
        r'\\\\': '\\',   # Escaped backslash
        r'\,': '',       # Thin space (often used in man pages)
        r'\/': '',       # Italic correction
    }
    
    # Special groff strings (common in man pages)
    GROFF_STRINGS = {
        r'\*(PX': 'POSIX',
        r'\*(GN': 'GNU',
        r'\*(AK': 'AWK',
        r'\*(UX': 'UNIX',
        r'\*(TX': 'TeX',
        r'\*(EP': 'The GAWK Manual',
        r'\*(lq': '"',  # Left quote
        r'\*(rq': '"',  # Right quote
    }
    
    def parse(self, content: str) -> str:
        """
        Parse and clean groff content completely.
        
        Args:
            content: Raw groff content
            
        Returns:
            Clean text without groff formatting
        """
        # Remove comments
        content = self._remove_comments(content)
        
        # Handle special groff strings first
        content = self._replace_groff_strings(content)
        
        # Remove all groff macros (lines starting with .)
        content = self._remove_groff_macros(content)
        
        # Handle font formatting
        content = self._handle_font_formatting(content)
        
        # Apply escape sequences
        content = self._apply_escape_sequences(content)
        
        # Clean up spacing and formatting
        content = self._cleanup_formatting(content)
        
        return content
    
    def _remove_comments(self, content: str) -> str:
        """Remove groff comments."""
        # Remove \" comments
        content = re.sub(r'\\".*$', '', content, flags=re.MULTILINE)
        # Remove .\\" comments
        content = re.sub(r'^\.\\".*$', '', content, flags=re.MULTILINE)
        return content
    
    def _replace_groff_strings(self, content: str) -> str:
        """Replace groff string interpolations."""
        for groff_str, replacement in self.GROFF_STRINGS.items():
            content = content.replace(groff_str, replacement)
        return content
    
    def _remove_groff_macros(self, content: str) -> str:
        """Remove all groff macro lines while preserving content."""
        lines = content.split('\n')
        result = []
        i = 0
        
        while i < len(lines):
            line = lines[i].rstrip()
            
            # Skip empty lines
            if not line:
                result.append('')
                i += 1
                continue
            
            # Handle .TP (tagged paragraph) - next line is the tag
            if line.startswith('.TP'):
                i += 1  # Skip the .TP line
                if i < len(lines):
                    # Next line is the tag
                    tag = lines[i].strip()
                    tag = self._clean_line_content(tag)
                    if tag:
                        result.append(f"\n{tag}")
                    i += 1
                continue
            
            # Handle .IP (indented paragraph) with inline label
            if line.startswith('.IP'):
                match = re.match(r'^\.IP\s+"?([^"]*)"?\s*(?:\d+)?\s*$', line)
                if match and match.group(1):
                    label = match.group(1).strip()
                    label = self._clean_line_content(label)
                    if label:
                        result.append(f"\n{label}")
                i += 1
                continue
            
            # Handle .B (bold) with inline text
            if line.startswith('.B '):
                text = line[3:].strip()
                text = self._clean_line_content(text)
                if text:
                    result.append(text)
                i += 1
                continue
            
            # Handle .I (italic) with inline text
            if line.startswith('.I '):
                text = line[3:].strip()
                text = self._clean_line_content(text)
                if text:
                    result.append(text)
                i += 1
                continue
            
            # Handle section headers
            if line.startswith('.SH'):
                # Could be .SH "NAME" or .SH followed by NAME on next line
                match = re.match(r'^\.SH\s+"?([^"]*)"?\s*$', line)
                if match and match.group(1):
                    # Inline section name
                    section = match.group(1).strip()
                    # Don't add section headers to content, they're handled separately
                else:
                    # Section name on next line
                    i += 1
                    if i < len(lines):
                        section = lines[i].strip().strip('"')
                        # Don't add section headers to content
                i += 1
                continue
            
            # Handle subsection headers
            if line.startswith('.SS'):
                match = re.match(r'^\.SS\s+"?([^"]*)"?\s*$', line)
                if match and match.group(1):
                    # Inline subsection name
                    pass
                else:
                    # Subsection name on next line
                    i += 1
                i += 1
                continue
            
            # Skip other groff commands
            if line.startswith('.'):
                # List of groff commands to skip entirely
                skip_commands = [
                    '.TH', '.PP', '.LP', '.P', '.br', '.sp', '.nf', '.fi',
                    '.RS', '.RE', '.PD', '.TP', '.HP', '.ad', '.na', '.nh',
                    '.hy', '.de', '.ds', '.so', '.ie', '.el', '.if', '.ig',
                    '.ft', '.ps', '.vs', '.ll', '.in', '.ti', '.ce', '.po',
                    '.BI', '.BR', '.IB', '.IR', '.RB', '.RI', '.SM', '.SB'
                ]
                
                # Skip any line that starts with a dot (groff command)
                if any(line.startswith(cmd) for cmd in skip_commands) or line == '.':
                    i += 1
                    continue
            
            # Regular content line
            cleaned = self._clean_line_content(line)
            if cleaned:
                result.append(cleaned)
            i += 1
        
        return '\n'.join(result)
    
    def _handle_font_formatting(self, content: str) -> str:
        """Handle font formatting commands."""
        # Remove font changes: \fB, \fI, \fR, \fP, etc.
        content = re.sub(r'\\f[BIPRSCW]', '', content)
        content = re.sub(r'\\f\([A-Z]{2}', '', content)
        content = re.sub(r'\\f\[[^\]]+\]', '', content)
        
        # Remove font size changes
        content = re.sub(r'\\s[+-]?\d+', '', content)
        content = re.sub(r'\\s\([+-]?\d+', '', content)
        
        return content
    
    def _apply_escape_sequences(self, content: str) -> str:
        """Apply escape sequence replacements."""
        # First handle special groff strings that might contain other escapes
        for escape, replacement in self.ESCAPE_SEQUENCES.items():
            content = content.replace(escape, replacement)
        
        # Handle numeric character references \N'xxx'
        content = re.sub(
            r"\\N'(\d+)'",
            lambda m: chr(int(m.group(1))) if int(m.group(1)) < 0x110000 else '?',
            content
        )
        
        # Remove any remaining backslash sequences we don't handle
        content = re.sub(r'\\[a-zA-Z]', '', content)
        
        return content
    
    def _clean_line_content(self, line: str) -> str:
        """Clean a single line of content."""
        # Remove font formatting
        line = re.sub(r'\\f[BIPRSCW]', '', line)
        line = re.sub(r'\\f\([A-Z]{2}', '', line)
        line = re.sub(r'\\f\[[^\]]+\]', '', line)
        
        # Apply escape sequences
        for escape, replacement in self.ESCAPE_SEQUENCES.items():
            line = line.replace(escape, replacement)
        
        # Apply groff strings
        for groff_str, replacement in self.GROFF_STRINGS.items():
            line = line.replace(groff_str, replacement)
        
        # Remove quotes that were used for groff string delimiting
        line = re.sub(r'^"(.+)"$', r'\1', line.strip())
        
        return line.strip()
    
    def _cleanup_formatting(self, content: str) -> str:
        """Clean up spacing and formatting."""
        # Remove multiple blank lines
        content = re.sub(r'\n{3,}', '\n\n', content)
        
        # Remove leading/trailing whitespace from lines
        lines = content.split('\n')
        lines = [line.strip() for line in lines]
        content = '\n'.join(lines)
        
        # Remove blank lines at start/end
        content = content.strip()
        
        # Fix spacing issues
        content = re.sub(r'[ \t]+', ' ', content)
        
        return content


def clean_groff_content(content: str) -> str:
    """
    Convenience function to clean groff content.
    
    Args:
        content: Raw groff content
        
    Returns:
        Clean text without groff formatting
    """
    parser = EnhancedGroffParser()
    return parser.parse(content)