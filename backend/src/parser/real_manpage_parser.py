"""
Parser for real man page content from the system.
Handles groff/troff formatting from actual man pages.
"""

import re
from typing import List, Dict, Optional, Tuple


class RealManPageParser:
    """Parser for real system man pages with groff/troff formatting."""
    
    # ANSI escape sequences and control characters
    ANSI_ESCAPE = re.compile(r'\x1b\[[0-9;]*m|\x1b\[[0-9;]*[a-zA-Z]')
    BACKSPACE_BOLD = re.compile(r'(.)\x08\1')  # Bold: char + backspace + same char
    BACKSPACE_UNDERLINE = re.compile(r'_\x08(.)')  # Underline: _ + backspace + char
    
    # Common section headers in man pages
    SECTION_HEADERS = [
        'NAME', 'SYNOPSIS', 'DESCRIPTION', 'OPTIONS', 'ARGUMENTS',
        'EXAMPLES', 'EXIT STATUS', 'RETURN VALUE', 'ERRORS', 'ENVIRONMENT',
        'FILES', 'VERSIONS', 'CONFORMING TO', 'NOTES', 'BUGS', 'AUTHOR',
        'AUTHORS', 'SEE ALSO', 'HISTORY', 'COPYRIGHT', 'LICENSE',
        'AVAILABILITY', 'DIAGNOSTICS', 'SECURITY', 'STANDARDS'
    ]
    
    @classmethod
    def clean_man_output(cls, text: str) -> str:
        """Remove ANSI escapes and backspace formatting from man output."""
        # Remove ANSI escape sequences
        text = cls.ANSI_ESCAPE.sub('', text)
        
        # Handle backspace-based bold (char + backspace + same char)
        text = cls.BACKSPACE_BOLD.sub(r'\1', text)
        
        # Handle backspace-based underline (_ + backspace + char)
        text = cls.BACKSPACE_UNDERLINE.sub(r'\1', text)
        
        # Remove any remaining backspace characters
        text = text.replace('\x08', '')
        
        # Remove form feed characters
        text = text.replace('\f', '')
        
        return text
    
    @classmethod
    def parse_sections(cls, content: str) -> List[Dict[str, str]]:
        """Parse man page content into sections."""
        # Clean the content first
        content = cls.clean_man_output(content)
        
        sections = []
        current_section = None
        current_content = []
        
        # Create regex pattern for section headers
        header_pattern = r'^\s*(' + '|'.join(cls.SECTION_HEADERS) + r')\s*$'
        
        for line in content.split('\n'):
            # Check if this line is a section header
            if re.match(header_pattern, line.strip(), re.IGNORECASE):
                # Save previous section if exists
                if current_section:
                    sections.append({
                        'name': current_section,
                        'content': '\n'.join(current_content).strip()
                    })
                
                current_section = line.strip().upper()
                current_content = []
            else:
                # Add line to current section
                if current_section:
                    current_content.append(line)
                elif line.strip():  # Before first section
                    # Some man pages have content before the first section
                    if not sections:
                        sections.append({
                            'name': 'HEADER',
                            'content': line
                        })
                    else:
                        sections[-1]['content'] += '\n' + line
        
        # Save last section
        if current_section:
            sections.append({
                'name': current_section,
                'content': '\n'.join(current_content).strip()
            })
        
        return sections
    
    @classmethod
    def extract_summary(cls, sections: List[Dict[str, str]]) -> str:
        """Extract summary from NAME section."""
        for section in sections:
            if section['name'] == 'NAME':
                content = section['content'].strip()
                # Usually format is "command - description"
                if ' - ' in content:
                    return content.split(' - ', 1)[1].strip()
                elif ' -- ' in content:
                    return content.split(' -- ', 1)[1].strip()
                elif ' — ' in content:  # em dash
                    return content.split(' — ', 1)[1].strip()
                else:
                    # Just return the content if no separator found
                    return content
        return ""
    
    @classmethod
    def format_for_display(cls, content: str) -> str:
        """Format man page content for web display."""
        # Clean the content
        content = cls.clean_man_output(content)
        
        # Convert some common patterns to markdown-like format
        lines = content.split('\n')
        formatted_lines = []
        
        for line in lines:
            # Indent detection for code blocks or examples
            if line.startswith('       '):  # 7+ spaces usually indicates code/example
                formatted_lines.append(line)
            elif line.startswith('   '):  # 3-6 spaces for indented content
                formatted_lines.append(line)
            else:
                # Check for option patterns like "-h, --help"
                option_match = re.match(r'^\s*(-\w+(?:,\s*--[\w-]+)?)\s+(.*)$', line)
                if option_match:
                    option, desc = option_match.groups()
                    formatted_lines.append(f"**{option}**  {desc}")
                else:
                    formatted_lines.append(line)
        
        return '\n'.join(formatted_lines)
    
    @classmethod
    def parse_options(cls, options_content: str) -> List[Dict[str, str]]:
        """Parse OPTIONS section into structured format."""
        options = []
        current_option = None
        current_desc = []
        
        for line in options_content.split('\n'):
            # Match option patterns
            option_match = re.match(r'^\s*(-\w+(?:,\s*--[\w-]+)?(?:\s+\S+)?)\s*(.*)$', line)
            
            if option_match and not line.startswith('     '):  # Not deeply indented
                # Save previous option
                if current_option:
                    options.append({
                        'flag': current_option,
                        'description': ' '.join(current_desc).strip()
                    })
                
                current_option = option_match.group(1).strip()
                desc_start = option_match.group(2).strip()
                current_desc = [desc_start] if desc_start else []
            elif current_option and line.strip():
                # Continuation of description
                current_desc.append(line.strip())
        
        # Save last option
        if current_option:
            options.append({
                'flag': current_option,
                'description': ' '.join(current_desc).strip()
            })
        
        return options