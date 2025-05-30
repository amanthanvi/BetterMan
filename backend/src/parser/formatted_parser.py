"""
Parser for formatted man page output (as opposed to raw groff source).
This handles the output from 'man' command which is already formatted.
"""

import re
import logging
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class FormattedManPageParser:
    """Parser for formatted man page output."""
    
    def __init__(self):
        """Initialize the parser with patterns for formatted man pages."""
        # Section headers in formatted output are typically uppercase
        self.section_pattern = re.compile(
            r'^([A-Z][A-Z\s/\-]+)$',
            re.MULTILINE
        )
        
        # Common section names to look for
        self.known_sections = {
            'NAME', 'SYNOPSIS', 'DESCRIPTION', 'OPTIONS', 'ARGUMENTS',
            'EXAMPLES', 'EXIT STATUS', 'RETURN VALUE', 'ERRORS', 'ENVIRONMENT',
            'FILES', 'VERSIONS', 'CONFORMING TO', 'NOTES', 'BUGS', 'EXAMPLE',
            'SEE ALSO', 'AUTHOR', 'AUTHORS', 'HISTORY', 'COPYRIGHT', 'LICENSE',
            'DIAGNOSTICS', 'SECURITY', 'STANDARDS', 'AVAILABILITY'
        }
        
        # Pattern to extract title from header line
        self.header_pattern = re.compile(
            r'^(\S+)\((\d+)\)\s+.*\s+(\S+)\((\d+)\)$'
        )
        
    def parse(self, content: str) -> Dict:
        """
        Parse formatted man page content.
        
        Args:
            content: Formatted man page text from 'man' command
            
        Returns:
            Dictionary with parsed structure
        """
        if not content:
            return self._empty_result()
            
        lines = content.split('\n')
        
        # Extract title and section from header
        title, section = self._extract_header_info(lines)
        
        # Find and parse sections
        sections = self._extract_sections(lines)
        
        # Extract summary from NAME section
        summary = self._extract_summary(sections)
        
        # Extract related commands from SEE ALSO section
        related = self._extract_related(sections)
        
        return {
            'title': title,
            'section': section,
            'summary': summary,
            'sections': sections,
            'related': related
        }
    
    def _empty_result(self) -> Dict:
        """Return empty result structure."""
        return {
            'title': 'Unknown',
            'section': '1',
            'summary': '',
            'sections': [],
            'related': []
        }
    
    def _extract_header_info(self, lines: List[str]) -> Tuple[str, str]:
        """Extract title and section from header line."""
        for line in lines[:5]:  # Check first few lines
            match = self.header_pattern.match(line.strip())
            if match:
                return match.group(1), match.group(2)
        
        # Fallback: try to extract from first non-empty line
        for line in lines:
            if line.strip():
                parts = line.strip().split('(')
                if len(parts) >= 2:
                    title = parts[0].strip()
                    section = parts[1].split(')')[0].strip()
                    if section.isdigit():
                        return title, section
                        
        return 'Unknown', '1'
    
    def _extract_sections(self, lines: List[str]) -> List[Dict[str, str]]:
        """Extract sections from formatted man page."""
        sections = []
        current_section = None
        current_content = []
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Check if this is a section header
            if self._is_section_header(line, lines, i):
                # Save previous section
                if current_section:
                    content = '\n'.join(current_content).strip()
                    if content:  # Only add non-empty sections
                        sections.append({
                            'name': current_section,
                            'content': self._clean_content(content)
                        })
                
                current_section = line
                current_content = []
                
                # Skip blank line after header if present
                if i + 1 < len(lines) and not lines[i + 1].strip():
                    i += 1
            
            elif current_section:
                # Add line to current section content
                current_content.append(lines[i])
            
            i += 1
        
        # Don't forget the last section
        if current_section and current_content:
            content = '\n'.join(current_content).strip()
            if content:
                sections.append({
                    'name': current_section,
                    'content': self._clean_content(content)
                })
        
        return sections
    
    def _is_section_header(self, line: str, lines: List[str], index: int) -> bool:
        """
        Determine if a line is a section header.
        
        Heuristics:
        1. Line is in known sections
        2. Line is all uppercase
        3. Line is followed by content (not another potential header)
        4. Line doesn't contain certain characters unlikely in headers
        """
        if not line or len(line) > 50:  # Headers are typically short
            return False
            
        # Check if it's a known section
        if line in self.known_sections:
            return True
            
        # Check if all uppercase and contains only letters, spaces, hyphens
        if line.isupper() and re.match(r'^[A-Z\s\-/]+$', line):
            # Make sure it's not just a single word in the middle of text
            # by checking context
            if index > 0 and index < len(lines) - 1:
                prev_line = lines[index - 1].strip()
                next_line = lines[index + 1].strip() if index + 1 < len(lines) else ''
                
                # If previous line is empty and next line is not uppercase,
                # it's likely a header
                if not prev_line and next_line and not next_line.isupper():
                    return True
                    
        return False
    
    def _clean_content(self, content: str) -> str:
        """Clean up section content."""
        # Remove excessive whitespace
        content = re.sub(r'\n{3,}', '\n\n', content)
        
        # Remove leading/trailing whitespace from each line
        lines = [line.rstrip() for line in content.split('\n')]
        content = '\n'.join(lines)
        
        # Handle common formatting patterns
        # Convert "   -option  description" to "-option: description"
        content = re.sub(
            r'^(\s{2,})([-\w]+)\s{2,}(.+)$',
            r'\1\2: \3',
            content,
            flags=re.MULTILINE
        )
        
        return content.strip()
    
    def _extract_summary(self, sections: List[Dict[str, str]]) -> str:
        """Extract summary from NAME section."""
        for section in sections:
            if section['name'] == 'NAME':
                content = section['content']
                # Usually format is "command - description"
                if ' - ' in content:
                    parts = content.split(' - ', 1)
                    if len(parts) == 2:
                        return parts[1].strip()
                elif '\\-' in content:  # Sometimes it's escaped
                    parts = content.split('\\-', 1)
                    if len(parts) == 2:
                        return parts[1].strip()
                # Return first line if no standard format
                return content.split('\n')[0].strip()
        return ''
    
    def _extract_related(self, sections: List[Dict[str, str]]) -> List[str]:
        """Extract related commands from SEE ALSO section."""
        related = []
        
        for section in sections:
            if section['name'] == 'SEE ALSO':
                content = section['content']
                
                # Match patterns like "command(1)" or "command (1)"
                pattern = re.compile(r'(\w+)\s*\((\d+)\)')
                matches = pattern.findall(content)
                
                for match in matches:
                    related.append(match[0])  # Just the command name
                    
                break
                
        return related


def parse_formatted_man_page(content: str) -> Dict:
    """
    Convenience function to parse formatted man page content.
    
    Args:
        content: Formatted man page content
        
    Returns:
        Parsed structure dictionary
    """
    parser = FormattedManPageParser()
    return parser.parse(content)