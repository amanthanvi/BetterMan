"""Enhanced man page parser for BetterMan API."""

import re
import json
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

class EnhancedManPageParser:
    """Parse raw man page content into structured format."""
    
    # Common section headers in man pages
    SECTION_HEADERS = [
        'NAME', 'SYNOPSIS', 'DESCRIPTION', 'OPTIONS', 'ARGUMENTS',
        'EXAMPLES', 'EXIT STATUS', 'RETURN VALUE', 'ERRORS',
        'ENVIRONMENT', 'FILES', 'VERSIONS', 'CONFORMING TO',
        'NOTES', 'BUGS', 'AUTHOR', 'AUTHORS', 'REPORTING BUGS',
        'COPYRIGHT', 'SEE ALSO', 'HISTORY', 'AVAILABILITY',
        'STANDARDS', 'COMMANDS', 'FUNCTIONS', 'LIBRARY', 'DIAGNOSTICS'
    ]
    
    def __init__(self):
        self.section_pattern = self._create_section_pattern()
    
    def _create_section_pattern(self):
        """Create regex pattern for section headers."""
        headers = '|'.join(self.SECTION_HEADERS)
        return re.compile(f'^({headers})\\s*$', re.MULTILINE | re.IGNORECASE)
    
    def parse(self, raw_content: str) -> Dict[str, Any]:
        """Parse raw man page content into structured format."""
        if not raw_content:
            return self._empty_result()
        
        # Clean the content first
        cleaned = self._clean_content(raw_content)
        
        # Parse into sections
        sections = self._parse_sections(cleaned)
        
        # Extract specific information
        parsed = {
            'sections': sections,
            'options': self._extract_options(sections),
            'examples': self._extract_examples(sections),
            'synopsis': self._extract_synopsis(sections),
            'description': self._extract_description(sections),
            'see_also': self._extract_see_also(sections),
            'parsed': True
        }
        
        return parsed
    
    def _clean_content(self, content: str) -> str:
        """Clean raw man page content."""
        # Remove man page headers/footers (e.g., "LS(1)    User Commands    LS(1)")
        content = re.sub(r'^[A-Z]+[\(\[][\d]+[\)\]]\s+.*?\s+[A-Z]+[\(\[][\d]+[\)\]]$', '', content, flags=re.MULTILINE)
        
        # Remove groff/troff escape sequences
        content = re.sub(r'\\f[BIRP]', '', content)  # Font changes
        content = re.sub(r'\\&', '', content)  # Zero-width space
        content = content.replace('\\-', '-')  # Hyphen
        content = content.replace("\\'", "'")  # Apostrophe
        content = content.replace('\\"', '"')  # Quote
        content = content.replace('\\e', '\\')  # Backslash
        content = re.sub(r'\\\^', '', content)  # Half-narrow space
        content = re.sub(r'\\\|', '', content)  # Sixth of em space
        content = re.sub(r'\\0', ' ', content)  # Digital space
        content = re.sub(r'\\~', ' ', content)  # Unbreakable space
        content = re.sub(r'\.\\\".*$', '', content, flags=re.MULTILINE)  # Comments
        
        # Remove excessive whitespace
        content = re.sub(r'\n{3,}', '\n\n', content)
        content = re.sub(r'[ \t]+', ' ', content)
        
        # Clean up section headers
        lines = content.split('\n')
        cleaned_lines = []
        for line in lines:
            # Check if it's an all-caps header
            stripped = line.strip()
            if stripped and stripped.isupper() and len(stripped.split()) <= 3:
                cleaned_lines.append(stripped)
            else:
                cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines).strip()
    
    def _parse_sections(self, content: str) -> List[Dict[str, str]]:
        """Parse content into sections."""
        sections = []
        
        # Split by section headers
        parts = self.section_pattern.split(content)
        
        # Process each section
        for i in range(1, len(parts), 2):
            if i + 1 < len(parts):
                title = parts[i].strip().upper()
                content_text = parts[i + 1].strip()
                
                if title and content_text:
                    sections.append({
                        'title': title,
                        'content': content_text,
                        'id': title.lower().replace(' ', '-')
                    })
        
        # If no sections found, treat entire content as description
        if not sections and content.strip():
            sections.append({
                'title': 'DESCRIPTION',
                'content': content.strip(),
                'id': 'description'
            })
        
        return sections
    
    def _extract_options(self, sections: List[Dict]) -> List[Dict[str, str]]:
        """Extract options/flags from OPTIONS section."""
        options = []
        
        for section in sections:
            if section['title'] == 'OPTIONS':
                content = section['content']
                # Parse individual options
                lines = content.split('\n')
                current_option = None
                
                for line in lines:
                    # Check if line starts with an option flag
                    # Improved regex to better match option patterns
                    option_match = re.match(r'^\s*((?:-[\w](?:\s+|,\s*)?)?(?:--[\w\-]+)?(?:[\[=]\S+\]?)?)', line)
                    
                    if option_match and option_match.group(1).startswith('-'):
                        # Save previous option if exists
                        if current_option:
                            # Clean up the description before saving
                            current_option['description'] = ' '.join(current_option['description'].split())
                            options.append(current_option)
                        
                        # Start new option
                        flag = option_match.group(1).strip()
                        remaining = line[len(option_match.group(0)):].strip()
                        
                        # Parse short and long flags
                        parts = re.split(r',\s*|\s+', flag)
                        short_flag = None
                        long_flag = flag
                        
                        for part in parts:
                            if part.startswith('--'):
                                long_flag = part
                            elif part.startswith('-') and len(part) <= 3:
                                short_flag = part
                        
                        current_option = {
                            'flag': long_flag,
                            'shortFlag': short_flag,
                            'description': remaining,
                            'argument': None
                        }
                        
                        # Check for argument in the flag
                        arg_match = re.search(r'[\[=]([^\]]+)\]?', flag)
                        if arg_match:
                            current_option['argument'] = arg_match.group(1)
                    
                    elif current_option and line.strip():
                        # Continue description of current option
                        # Add proper spacing
                        if current_option['description']:
                            current_option['description'] += ' ' + line.strip()
                        else:
                            current_option['description'] = line.strip()
                
                # Don't forget the last option
                if current_option:
                    # Clean up the description before saving
                    current_option['description'] = ' '.join(current_option['description'].split())
                    options.append(current_option)
                
                break
        
        return options
    
    def _extract_examples(self, sections: List[Dict]) -> List[Dict[str, str]]:
        """Extract examples from EXAMPLES section."""
        examples = []
        
        for section in sections:
            if section['title'] == 'EXAMPLES':
                content = section['content']
                lines = content.split('\n')
                
                current_example = None
                
                for line in lines:
                    # Check if line is a command (starts with $ or # or is indented)
                    is_command = (line.strip().startswith('$') or 
                                 line.strip().startswith('#') or
                                 line.startswith('       ') or 
                                 line.startswith('\t'))
                    
                    if is_command:
                        command = line.strip()
                        # Remove $ or # prefix
                        command = re.sub(r'^[\$#]\s*', '', command)
                        
                        if current_example and not current_example.get('command'):
                            current_example['command'] = command
                        elif not current_example:
                            current_example = {'command': command, 'description': ''}
                        else:
                            # Save previous example and start new one
                            if current_example['command']:
                                examples.append(current_example)
                            current_example = {'command': command, 'description': ''}
                    
                    elif line.strip() and current_example:
                        # This is a description
                        if not current_example.get('command'):
                            current_example['description'] = line.strip()
                        else:
                            # Save current and start new
                            examples.append(current_example)
                            current_example = {'description': line.strip(), 'command': ''}
                    
                    elif not line.strip() and current_example and current_example.get('command'):
                        # Empty line ends current example
                        examples.append(current_example)
                        current_example = None
                
                # Don't forget the last example
                if current_example and current_example.get('command'):
                    examples.append(current_example)
                
                break
        
        return examples
    
    def _extract_synopsis(self, sections: List[Dict]) -> str:
        """Extract synopsis from SYNOPSIS section."""
        for section in sections:
            if section['title'] == 'SYNOPSIS':
                # Clean up the synopsis
                synopsis = section['content'].strip()
                # Preserve newlines between different command forms
                synopsis = re.sub(r'\n\s*\n', '\n', synopsis)  # Remove empty lines
                # Replace multiple spaces with single space (but preserve newlines)
                lines = synopsis.split('\n')
                cleaned_lines = []
                for line in lines:
                    # Clean each line individually to preserve structure
                    cleaned_line = re.sub(r'\s+', ' ', line.strip())
                    if cleaned_line:
                        cleaned_lines.append(cleaned_line)
                # Join with space or newline depending on content
                if len(cleaned_lines) > 1:
                    synopsis = '\n'.join(cleaned_lines)
                else:
                    synopsis = cleaned_lines[0] if cleaned_lines else ''
                return synopsis
        return ''
    
    def _extract_description(self, sections: List[Dict]) -> str:
        """Extract description from DESCRIPTION or NAME section."""
        # Try NAME section first (usually has a brief description)
        for section in sections:
            if section['title'] == 'NAME':
                content = section['content']
                # Usually format is "command - description"
                if ' - ' in content:
                    return content.split(' - ', 1)[1].strip()
        
        # Fall back to DESCRIPTION section
        for section in sections:
            if section['title'] == 'DESCRIPTION':
                # Get first paragraph as description
                paragraphs = section['content'].split('\n\n')
                if paragraphs:
                    return paragraphs[0].strip()
        
        return ''
    
    def _extract_see_also(self, sections: List[Dict]) -> List[Dict[str, Any]]:
        """Extract related commands from SEE ALSO section."""
        see_also = []
        
        for section in sections:
            if section['title'] == 'SEE ALSO':
                content = section['content']
                # Match man page references like "ls(1)" or "grep(1)"
                matches = re.findall(r'(\w+)\((\d+)\)', content)
                
                for name, section_num in matches:
                    see_also.append({
                        'name': name,
                        'section': int(section_num)
                    })
                
                break
        
        return see_also
    
    def _empty_result(self) -> Dict[str, Any]:
        """Return empty parsed result."""
        return {
            'sections': [],
            'options': [],
            'examples': [],
            'synopsis': '',
            'description': '',
            'see_also': [],
            'parsed': False
        }


# Global parser instance
_parser_instance = None

def get_parser() -> EnhancedManPageParser:
    """Get or create the global parser instance."""
    global _parser_instance
    if _parser_instance is None:
        _parser_instance = EnhancedManPageParser()
    return _parser_instance

def parse_man_page(raw_content: str) -> Dict[str, Any]:
    """Parse raw man page content."""
    parser = get_parser()
    return parser.parse(raw_content)