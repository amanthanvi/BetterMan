"""
Enhanced groff parser with comprehensive man page macro support.
"""

import re
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import logging


logger = logging.getLogger(__name__)


class MacroType(Enum):
    """Man page macro types."""
    TH = "TH"  # Title header
    SH = "SH"  # Section header
    SS = "SS"  # Subsection header
    TP = "TP"  # Tagged paragraph
    PP = "PP"  # Plain paragraph
    LP = "LP"  # Left paragraph
    IP = "IP"  # Indented paragraph
    HP = "HP"  # Hanging paragraph
    RS = "RS"  # Relative indent start
    RE = "RE"  # Relative indent end
    BR = "BR"  # Bold/Roman alternating
    RB = "RB"  # Roman/Bold alternating
    IR = "IR"  # Italic/Roman alternating
    RI = "RI"  # Roman/Italic alternating
    BI = "BI"  # Bold/Italic alternating
    IB = "IB"  # Italic/Bold alternating
    B = "B"    # Bold
    I = "I"    # Italic
    R = "R"    # Roman
    SM = "SM"  # Small
    SB = "SB"  # Small bold
    P = "P"    # Paragraph
    OP = "OP"  # Option
    EE = "EE"  # Example end
    EX = "EX"  # Example start
    fi = "fi"  # Fill mode
    nf = "nf"  # No fill mode
    ad = "ad"  # Adjust
    na = "na"  # No adjust
    sp = "sp"  # Vertical space
    br = "br"  # Break
    bp = "bp"  # Break page


@dataclass
class ParsedSection:
    """Represents a parsed section of a man page."""
    name: str
    content: List[str] = field(default_factory=list)
    subsections: List['ParsedSection'] = field(default_factory=list)
    level: int = 1
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ManPageInfo:
    """Man page metadata from TH macro."""
    title: str = ""
    section: str = ""
    date: str = ""
    source: str = ""
    manual: str = ""


class EnhancedGroffParser:
    """
    Enhanced groff parser with full macro support.
    
    Features:
    - Complete man page macro handling
    - Proper text formatting and escaping
    - Section hierarchy preservation
    - Cross-reference detection
    - Code block identification
    """
    
    def __init__(self):
        """Initialize the enhanced parser."""
        self.reset()
        
    def reset(self):
        """Reset parser state."""
        self.info = ManPageInfo()
        self.sections: List[ParsedSection] = []
        self.current_section: Optional[ParsedSection] = None
        self.current_subsection: Optional[ParsedSection] = None
        self.indent_level = 0
        self.fill_mode = True
        self.in_example = False
        self.pending_tag = None
        self.font_stack = ['R']
        
    def parse(self, content: str) -> Dict[str, Any]:
        """
        Parse man page content with full macro support.
        
        Args:
            content: Raw man page content
            
        Returns:
            Parsed document structure
        """
        self.reset()
        lines = content.split('\n')
        
        i = 0
        while i < len(lines):
            line = lines[i].rstrip()
            
            # Skip empty lines in no-fill mode
            if not line and not self.fill_mode:
                self._add_content("")
                i += 1
                continue
            
            # Handle macro lines
            if line.startswith('.'):
                i = self._handle_macro(lines, i)
            else:
                # Handle text lines
                self._handle_text_line(line)
                i += 1
        
        # Finalize any pending content
        self._finalize_sections()
        
        return self._build_output()
    
    def _handle_macro(self, lines: List[str], index: int) -> int:
        """Handle macro commands."""
        line = lines[index]
        
        # Extract macro and arguments
        parts = line.split(None, 1)
        if not parts:
            return index + 1
        
        macro = parts[0][1:]  # Remove leading dot
        args = parts[1] if len(parts) > 1 else ""
        
        # Get macro handler
        handler = getattr(self, f'_handle_{macro}', None)
        if handler:
            return handler(lines, index, args)
        else:
            # Unknown macro - try generic handling
            return self._handle_generic_macro(lines, index, macro, args)
    
    def _handle_TH(self, lines: List[str], index: int, args: str) -> int:
        """Handle title header macro."""
        parts = self._parse_args(args)
        self.info.title = parts[0] if parts else ""
        self.info.section = parts[1] if len(parts) > 1 else ""
        self.info.date = parts[2] if len(parts) > 2 else ""
        self.info.source = parts[3] if len(parts) > 3 else ""
        self.info.manual = parts[4] if len(parts) > 4 else ""
        return index + 1
    
    def _handle_SH(self, lines: List[str], index: int, args: str) -> int:
        """Handle section header macro."""
        # Finalize previous section
        self._finalize_subsection()
        
        # Get section name
        if args:
            section_name = args.strip('"')
        else:
            # Next line contains section name
            index += 1
            if index < len(lines):
                section_name = lines[index].strip('"')
            else:
                section_name = "UNKNOWN"
        
        # Create new section
        self.current_section = ParsedSection(
            name=section_name.upper(),
            level=1
        )
        self.sections.append(self.current_section)
        self.current_subsection = None
        
        return index + 1
    
    def _handle_SS(self, lines: List[str], index: int, args: str) -> int:
        """Handle subsection header macro."""
        # Finalize previous subsection
        self._finalize_subsection()
        
        # Get subsection name
        if args:
            subsection_name = args.strip('"')
        else:
            # Next line contains subsection name
            index += 1
            if index < len(lines):
                subsection_name = lines[index].strip('"')
            else:
                subsection_name = "UNKNOWN"
        
        # Create new subsection
        if self.current_section:
            self.current_subsection = ParsedSection(
                name=subsection_name,
                level=2
            )
            self.current_section.subsections.append(self.current_subsection)
        
        return index + 1
    
    def _handle_TP(self, lines: List[str], index: int, args: str) -> int:
        """Handle tagged paragraph macro."""
        # Next line is the tag
        index += 1
        if index < len(lines):
            self.pending_tag = self._format_text(lines[index])
        return index + 1
    
    def _handle_IP(self, lines: List[str], index: int, args: str) -> int:
        """Handle indented paragraph macro."""
        tag = self._parse_args(args)[0] if args else "•"
        self._add_content(f"{tag} ", indent=True)
        return index + 1
    
    def _handle_PP(self, lines: List[str], index: int, args: str) -> int:
        """Handle plain paragraph macro."""
        self._add_content("")  # Add blank line
        return index + 1
    
    def _handle_BR(self, lines: List[str], index: int, args: str) -> int:
        """Handle bold/roman alternating macro."""
        parts = self._parse_args(args)
        formatted = []
        for i, part in enumerate(parts):
            if i % 2 == 0:
                formatted.append(f"**{part}**")
            else:
                formatted.append(part)
        self._add_content(" ".join(formatted))
        return index + 1
    
    def _handle_B(self, lines: List[str], index: int, args: str) -> int:
        """Handle bold macro."""
        if args:
            self._add_content(f"**{args}**")
        else:
            self.font_stack.append('B')
        return index + 1
    
    def _handle_I(self, lines: List[str], index: int, args: str) -> int:
        """Handle italic macro."""
        if args:
            self._add_content(f"*{args}*")
        else:
            self.font_stack.append('I')
        return index + 1
    
    def _handle_EX(self, lines: List[str], index: int, args: str) -> int:
        """Handle example start macro."""
        self.in_example = True
        self.fill_mode = False
        self._add_content("```")
        return index + 1
    
    def _handle_EE(self, lines: List[str], index: int, args: str) -> int:
        """Handle example end macro."""
        self.in_example = False
        self.fill_mode = True
        self._add_content("```")
        return index + 1
    
    def _handle_nf(self, lines: List[str], index: int, args: str) -> int:
        """Handle no-fill mode macro."""
        self.fill_mode = False
        if not self.in_example:
            self._add_content("```")
        return index + 1
    
    def _handle_fi(self, lines: List[str], index: int, args: str) -> int:
        """Handle fill mode macro."""
        if not self.fill_mode and not self.in_example:
            self._add_content("```")
        self.fill_mode = True
        return index + 1
    
    def _handle_RS(self, lines: List[str], index: int, args: str) -> int:
        """Handle relative indent start."""
        self.indent_level += 1
        return index + 1
    
    def _handle_RE(self, lines: List[str], index: int, args: str) -> int:
        """Handle relative indent end."""
        self.indent_level = max(0, self.indent_level - 1)
        return index + 1
    
    def _handle_sp(self, lines: List[str], index: int, args: str) -> int:
        """Handle vertical space."""
        self._add_content("")
        return index + 1
    
    def _handle_br(self, lines: List[str], index: int, args: str) -> int:
        """Handle line break."""
        self._add_content("  ")  # Markdown line break
        return index + 1
    
    def _handle_generic_macro(self, lines: List[str], index: int, macro: str, args: str) -> int:
        """Handle unknown macros generically."""
        # Log unknown macro for debugging
        logger.debug(f"Unknown macro: .{macro} {args}")
        return index + 1
    
    def _handle_text_line(self, line: str):
        """Handle regular text line."""
        if self.pending_tag:
            # This is the content for a tagged paragraph
            self._add_content(f"{self.pending_tag}\n    {self._format_text(line)}")
            self.pending_tag = None
        else:
            formatted = self._format_text(line)
            if formatted or not self.fill_mode:
                self._add_content(formatted)
    
    def _format_text(self, text: str) -> str:
        """Format text with escape sequences and font changes."""
        # Handle common escape sequences
        text = self._process_escapes(text)
        
        # Handle inline font changes
        text = self._process_inline_fonts(text)
        
        # Handle cross-references
        text = self._process_references(text)
        
        return text
    
    def _process_escapes(self, text: str) -> str:
        """Process groff escape sequences."""
        # Common escape sequences
        replacements = {
            r'\-': '-',
            r'\ ': ' ',
            r'\e': '\\',
            r'\&': '',
            r'\~': ' ',
            r'\(aq': "'",
            r'\(cq': "'",
            r'\(oq': "'",
            r'\(dq': '"',
            r'\(em': '—',
            r'\(en': '–',
            r'\(bu': '•',
            r'\(co': '©',
            r'\(rg': '®',
            r'\(tm': '™',
            r'\*(': '',  # String variable (simplified)
            r'\fB': '**',  # Bold start
            r'\fI': '*',   # Italic start
            r'\fR': '',    # Roman (reset)
            r'\fP': '',    # Previous font
        }
        
        for escape, replacement in replacements.items():
            text = text.replace(escape, replacement)
        
        # Handle \f[BIPR] font changes
        text = re.sub(r'\\f\[([BIPR])\]', self._font_to_markdown, text)
        
        # Remove other escape sequences
        text = re.sub(r'\\[a-zA-Z]\(..', '', text)
        text = re.sub(r'\\[a-zA-Z].', '', text)
        text = re.sub(r'\\[a-zA-Z]', '', text)
        
        return text
    
    def _font_to_markdown(self, match):
        """Convert font codes to markdown."""
        font = match.group(1)
        if font == 'B':
            return '**'
        elif font == 'I':
            return '*'
        else:
            return ''
    
    def _process_inline_fonts(self, text: str) -> str:
        """Process inline font changes."""
        # Handle \fBtext\fR patterns
        text = re.sub(r'\\fB([^\\]+)\\fR', r'**\1**', text)
        text = re.sub(r'\\fI([^\\]+)\\fR', r'*\1*', text)
        
        # Handle alternating fonts
        text = re.sub(r'\\fB([^\\]+)\\fI([^\\]+)\\fR', r'**\1***\2*', text)
        
        return text
    
    def _process_references(self, text: str) -> str:
        """Process man page cross-references."""
        # Match patterns like command(section)
        def make_ref(match):
            cmd = match.group(1)
            section = match.group(2)
            return f"[{cmd}({section})]({cmd})"
        
        text = re.sub(r'\b([a-zA-Z][\w\-\.]*)\((\d+)\)', make_ref, text)
        return text
    
    def _parse_args(self, args: str) -> List[str]:
        """Parse macro arguments respecting quotes."""
        if not args:
            return []
        
        # Simple quote-aware splitting
        parts = []
        current = []
        in_quotes = False
        
        for char in args:
            if char == '"' and not in_quotes:
                in_quotes = True
            elif char == '"' and in_quotes:
                in_quotes = False
                parts.append(''.join(current))
                current = []
            elif char == ' ' and not in_quotes:
                if current:
                    parts.append(''.join(current))
                    current = []
            else:
                current.append(char)
        
        if current:
            parts.append(''.join(current))
        
        return parts
    
    def _add_content(self, text: str, indent: bool = False):
        """Add content to current section."""
        if indent and self.indent_level > 0:
            text = "    " * self.indent_level + text
        
        if self.current_subsection:
            self.current_subsection.content.append(text)
        elif self.current_section:
            self.current_section.content.append(text)
    
    def _finalize_subsection(self):
        """Finalize current subsection."""
        # Clean up trailing empty lines
        if self.current_subsection and self.current_subsection.content:
            while self.current_subsection.content and not self.current_subsection.content[-1]:
                self.current_subsection.content.pop()
    
    def _finalize_sections(self):
        """Finalize all sections."""
        self._finalize_subsection()
        
        # Clean up section content
        for section in self.sections:
            if section.content:
                while section.content and not section.content[-1]:
                    section.content.pop()
    
    def _build_output(self) -> Dict[str, Any]:
        """Build final output structure."""
        return {
            'title': self.info.title,
            'section': self.info.section,
            'date': self.info.date,
            'source': self.info.source,
            'manual': self.info.manual,
            'sections': [self._section_to_dict(s) for s in self.sections]
        }
    
    def _section_to_dict(self, section: ParsedSection) -> Dict[str, Any]:
        """Convert section to dictionary."""
        return {
            'name': section.name,
            'content': '\n'.join(section.content),
            'subsections': [self._section_to_dict(s) for s in section.subsections]
        }