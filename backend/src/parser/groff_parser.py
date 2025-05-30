"""
Advanced groff parser for handling man page formatting sequences.

This module provides robust parsing of groff/troff escape sequences
commonly found in man pages, with proper handling of nested formatting,
Unicode, and edge cases.
"""

import re
import unicodedata
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum


class FontStyle(Enum):
    """Enumeration of font styles in groff."""
    ROMAN = 'R'
    BOLD = 'B'
    ITALIC = 'I'
    SYMBOL = 'S'
    CONSTANT_WIDTH = 'CW'
    PREVIOUS = 'P'


@dataclass
class FormatSpan:
    """Represents a span of formatted text."""
    text: str
    style: FontStyle
    start: int
    end: int


class GroffParser:
    """Advanced parser for groff/troff escape sequences."""
    
    # Common groff escape sequences
    ESCAPE_SEQUENCES = {
        r'\-': '-',  # Hyphen
        r'\ ': ' ',  # Non-breaking space
        r'\e': '\\',  # Backslash
        r'\(aq': "'",  # Apostrophe
        r'\(cq': "'",  # Closing single quote
        r'\(oq': "'",  # Opening single quote
        r'\(dq': '"',  # Double quote
        r'\(em': '—',  # Em dash
        r'\(en': '–',  # En dash
        r'\(bu': '•',  # Bullet
        r'\(co': '©',  # Copyright
        r'\(rg': '®',  # Registered
        r'\(tm': '™',  # Trademark
        r'\(+-': '±',  # Plus-minus
        r'\(mu': '×',  # Multiplication
        r'\(di': '÷',  # Division
        r'\(de': '°',  # Degree
        r'\(ct': '¢',  # Cent
        r'\(Po': '£',  # Pound
        r'\(Eu': '€',  # Euro
        r'\(Ye': '¥',  # Yen
        r'\(sc': '§',  # Section
        r'\(dg': '†',  # Dagger
        r'\(dd': '‡',  # Double dagger
        r'\(lq': '"',  # Left double quote
        r'\(rq': '"',  # Right double quote
        r'\(hy': '‐',  # Hyphen
        r'\&': '',   # Zero-width space
        r'\~': ' ',  # Non-breaking space
        r'\0': ' ',  # Digit-width space
        r'\|': '',   # Sixth-em space
        r'\^': '',   # Half-em space
    }
    
    # Character translations for special cases
    CHAR_TRANSLATIONS = {
        '\x08': '',  # Backspace (used for overstriking)
        '\x1b': '',  # Escape character
        '\xa0': ' ',  # Non-breaking space
    }
    
    def __init__(self):
        """Initialize the groff parser."""
        self.font_stack = [FontStyle.ROMAN]
        self.current_font = FontStyle.ROMAN
        
    def parse(self, content: str) -> str:
        """
        Parse groff content and convert to formatted text.
        
        Args:
            content: Raw groff content
            
        Returns:
            Formatted text with Markdown-style formatting
        """
        # Normalize Unicode
        content = unicodedata.normalize('NFC', content)
        
        # Handle overstriking (char + backspace + char)
        content = self._handle_overstriking(content)
        
        # Parse font changes and collect format spans
        format_spans = self._parse_font_changes(content)
        
        # Apply escape sequences
        content = self._apply_escape_sequences(content)
        
        # Apply formatting based on spans
        formatted = self._apply_formatting(content, format_spans)
        
        # Clean up remaining groff commands
        formatted = self._clean_groff_commands(formatted)
        
        # Final cleanup
        formatted = self._final_cleanup(formatted)
        
        return formatted
    
    def _handle_overstriking(self, content: str) -> str:
        """Handle overstrike sequences (char + backspace + char)."""
        # Pattern for overstrike: character + backspace + same character = bold
        content = re.sub(r'(.)\x08\1', lambda m: f'**{m.group(1)}**', content)
        
        # Pattern for underline: underscore + backspace + character
        content = re.sub(r'_\x08(.)', lambda m: f'*{m.group(1)}*', content)
        
        # Remove remaining backspaces
        content = content.replace('\x08', '')
        
        return content
    
    def _parse_font_changes(self, content: str) -> List[FormatSpan]:
        """Parse font change sequences and return format spans."""
        spans = []
        pos = 0
        
        # Pattern for font changes: \fX, \f(XX, \f[XXX]
        font_pattern = re.compile(
            r'\\f(?:'
            r'([RBISPN])|'  # Single character font
            r'\(([A-Z]{2})|'  # Two character font
            r'\[([^\]]+)\]'  # Bracketed font name
            r')'
        )
        
        current_style = FontStyle.ROMAN
        style_start = 0
        
        for match in font_pattern.finditer(content):
            # Get the font code
            font_code = match.group(1) or match.group(2) or match.group(3)
            
            # Map font code to style
            if font_code == 'P':
                # Previous font
                new_style = self.font_stack[-2] if len(self.font_stack) > 1 else FontStyle.ROMAN
            else:
                new_style = self._map_font_code(font_code)
            
            # Create span for previous section if style changed
            if new_style != current_style and match.start() > style_start:
                spans.append(FormatSpan(
                    text=content[style_start:match.start()],
                    style=current_style,
                    start=style_start,
                    end=match.start()
                ))
            
            # Update font stack
            if font_code == 'P' and len(self.font_stack) > 1:
                self.font_stack.pop()
            else:
                self.font_stack.append(new_style)
            
            current_style = new_style
            style_start = match.end()
        
        # Add final span
        if style_start < len(content):
            spans.append(FormatSpan(
                text=content[style_start:],
                style=current_style,
                start=style_start,
                end=len(content)
            ))
        
        return spans
    
    def _map_font_code(self, code: str) -> FontStyle:
        """Map font code to FontStyle enum."""
        mapping = {
            'R': FontStyle.ROMAN,
            'B': FontStyle.BOLD,
            'I': FontStyle.ITALIC,
            'S': FontStyle.SYMBOL,
            'CW': FontStyle.CONSTANT_WIDTH,
            'CB': FontStyle.BOLD,  # Constant Bold
            'CI': FontStyle.ITALIC,  # Constant Italic
            'CR': FontStyle.CONSTANT_WIDTH,  # Constant Roman
        }
        return mapping.get(code, FontStyle.ROMAN)
    
    def _apply_escape_sequences(self, content: str) -> str:
        """Apply groff escape sequence replacements."""
        for escape, replacement in self.ESCAPE_SEQUENCES.items():
            content = content.replace(escape, replacement)
        
        # Handle numeric character references \N'xxx'
        content = re.sub(
            r"\\N'(\d+)'",
            lambda m: chr(int(m.group(1))) if int(m.group(1)) < 0x110000 else '?',
            content
        )
        
        # Handle special character translations
        for char, replacement in self.CHAR_TRANSLATIONS.items():
            content = content.replace(char, replacement)
        
        return content
    
    def _apply_formatting(self, content: str, spans: List[FormatSpan]) -> str:
        """Apply Markdown formatting based on format spans."""
        if not spans:
            return content
        
        # Sort spans by start position
        spans.sort(key=lambda s: s.start)
        
        # Build formatted result
        result = []
        offset = 0
        
        for span in spans:
            # Remove font change sequences from the span text
            clean_text = re.sub(r'\\f(?:[RBISPN]|\([A-Z]{2}|\[[^\]]+\])', '', span.text)
            
            if not clean_text.strip():
                continue
            
            # Apply formatting based on style
            if span.style == FontStyle.BOLD:
                formatted_text = f'**{clean_text}**'
            elif span.style == FontStyle.ITALIC:
                formatted_text = f'*{clean_text}*'
            elif span.style == FontStyle.CONSTANT_WIDTH:
                formatted_text = f'`{clean_text}`'
            else:
                formatted_text = clean_text
            
            result.append(formatted_text)
        
        return ''.join(result)
    
    def _clean_groff_commands(self, content: str) -> str:
        """Remove remaining groff commands while preserving content."""
        # Remove font commands that weren't processed
        content = re.sub(r'\\f[RBISPN]', '', content)
        content = re.sub(r'\\f\([A-Z]{2}', '', content)
        content = re.sub(r'\\f\[[^\]]+\]', '', content)
        
        # Remove size changes
        content = re.sub(r'\\s[+-]?\d+', '', content)
        content = re.sub(r'\\s\([+-]?\d+', '', content)
        
        # Remove vertical spacing
        content = re.sub(r'\\v\'[^\']+\'', '', content)
        
        # Remove horizontal motion
        content = re.sub(r'\\h\'[^\']+\'', '', content)
        
        # Remove color changes
        content = re.sub(r'\\m\[[^\]]+\]', '', content)
        content = re.sub(r'\\M\[[^\]]+\]', '', content)
        
        # Remove other escape sequences
        content = re.sub(r'\\[cCdDhHlLNoOsSvwxXZ].', '', content)
        
        return content
    
    def _final_cleanup(self, content: str) -> str:
        """Perform final cleanup of the formatted text."""
        # Normalize whitespace
        content = re.sub(r'[ \t]+', ' ', content)
        
        # Fix spacing around formatted text
        content = re.sub(r'\s*\*\*\s*', '**', content)
        content = re.sub(r'\s*\*\s*', '*', content)
        content = re.sub(r'\s*`\s*', '`', content)
        
        # Remove empty formatting
        content = re.sub(r'\*\*\*\*', '', content)
        content = re.sub(r'\*\*', '', content)
        content = re.sub(r'``', '', content)
        
        # Ensure proper spacing after formatting
        content = re.sub(r'(\*\*[^*]+\*\*)(\w)', r'\1 \2', content)
        content = re.sub(r'(\*[^*]+\*)(\w)', r'\1 \2', content)
        content = re.sub(r'(`[^`]+`)(\w)', r'\1 \2', content)
        
        return content.strip()


def parse_groff_content(content: str) -> str:
    """
    Convenience function to parse groff content.
    
    Args:
        content: Raw groff content
        
    Returns:
        Formatted text with Markdown-style formatting
    """
    parser = GroffParser()
    return parser.parse(content)