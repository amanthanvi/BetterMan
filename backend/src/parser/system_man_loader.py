"""Load complete man pages directly from the system."""

import subprocess
import os
import re
from typing import Optional, Tuple, Dict, Any
import logging

logger = logging.getLogger(__name__)

def get_complete_man_page(command: str, section: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    """
    Get the complete man page content from the system.
    
    Returns:
        Tuple of (content, error_message)
    """
    try:
        # Build the man command
        cmd = ["man"]
        
        # Add section if specified
        if section:
            cmd.extend(["-s", section])
        
        # Request specific formatting for better parsing
        # -P cat: Use cat as pager (no interactive mode)
        # --no-hyphenation: Prevent word breaking
        # --encoding=utf8: Ensure UTF-8 output
        cmd.extend([
            "-P", "cat",
            "--no-hyphenation", 
            "--encoding=utf8",
            command
        ])
        
        # Run the command
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env={**os.environ, "MANWIDTH": "100", "COLUMNS": "100"}  # Set consistent width
        )
        
        if result.returncode == 0 and result.stdout.strip():
            content = result.stdout
            
            # Clean up the content
            content = clean_man_page_content(content)
            
            logger.info(f"Successfully loaded system man page for {command}, length: {len(content)}")
            return content, None
        else:
            error_msg = result.stderr.strip() or f"Man page not found for {command}"
            logger.debug(f"System man page not found for {command}: {error_msg}")
            return None, error_msg
            
    except Exception as e:
        logger.error(f"Error fetching man page for {command}: {e}")
        return None, str(e)


def get_raw_man_page(command: str, section: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    """
    Get the raw groff source of a man page.
    
    Returns:
        Tuple of (raw_content, error_message)
    """
    try:
        # First, find the man page file
        cmd = ["man", "-w"]
        if section:
            cmd.extend(["-s", section])
        cmd.append(command)
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            return None, f"Man page not found for {command}"
        
        man_file = result.stdout.strip()
        
        # Read the file content
        if man_file.endswith('.gz'):
            import gzip
            with gzip.open(man_file, 'rt', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        else:
            with open(man_file, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        
        return content, None
        
    except Exception as e:
        logger.error(f"Error reading raw man page for {command}: {e}")
        return None, str(e)


def clean_man_page_content(content: str) -> str:
    """Clean up man page content for better display."""
    # Remove backspace characters and their preceding character (used for bold/underline)
    content = re.sub(r'.\x08', '', content)
    
    # Remove ANSI escape sequences
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    content = ansi_escape.sub('', content)
    
    # Remove form feed characters
    content = content.replace('\f', '')
    
    # Normalize whitespace while preserving structure
    lines = content.split('\n')
    cleaned_lines = []
    
    for line in lines:
        # Preserve empty lines (they're meaningful in man pages)
        if not line.strip():
            cleaned_lines.append('')
        else:
            # Clean up the line while preserving indentation
            cleaned_line = line.rstrip()
            cleaned_lines.append(cleaned_line)
    
    # Remove excessive empty lines (more than 2 in a row)
    final_lines = []
    empty_count = 0
    
    for line in cleaned_lines:
        if not line.strip():
            empty_count += 1
            if empty_count <= 2:
                final_lines.append(line)
        else:
            empty_count = 0
            final_lines.append(line)
    
    return '\n'.join(final_lines)


def parse_man_page_structure(content: str) -> Dict[str, Any]:
    """
    Parse man page content into a structured format.
    
    Returns a dictionary with:
    - title: The command name and short description
    - sections: List of section dictionaries with name and content
    - metadata: Additional information like section number, date, etc.
    """
    lines = content.split('\n')
    
    # Extract metadata from header
    metadata = extract_metadata(lines)
    
    # Parse sections
    sections = []
    current_section = None
    current_content = []
    
    # Common section headers in man pages
    section_patterns = [
        r'^[A-Z][A-Z\s]+$',  # ALL CAPS
        r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$',  # Title Case
    ]
    
    for line in lines:
        # Check if this is a section header
        is_section = False
        stripped = line.strip()
        
        if stripped and len(stripped) < 50:  # Section headers are usually short
            for pattern in section_patterns:
                if re.match(pattern, stripped):
                    # Additional checks to avoid false positives
                    if not any(char in stripped for char in ['.', ',', '(', ')', '[', ']']):
                        is_section = True
                        break
        
        if is_section:
            # Save previous section
            if current_section:
                sections.append({
                    'name': current_section,
                    'content': '\n'.join(current_content).strip()
                })
            
            current_section = stripped
            current_content = []
        else:
            current_content.append(line)
    
    # Don't forget the last section
    if current_section:
        sections.append({
            'name': current_section,
            'content': '\n'.join(current_content).strip()
        })
    
    # Extract title from NAME section if available
    title = metadata.get('title', '')
    for section in sections:
        if section['name'].upper() == 'NAME':
            # Parse NAME section (format: "command - description")
            name_content = section['content'].strip()
            if ' - ' in name_content:
                title = name_content
            break
    
    return {
        'title': title,
        'sections': sections,
        'metadata': metadata
    }


def extract_metadata(lines: list) -> dict:
    """Extract metadata from man page header."""
    metadata = {}
    
    # Look for header line (usually first or within first few lines)
    for i, line in enumerate(lines[:10]):
        # Common header format: COMMAND(SECTION)     Category     COMMAND(SECTION)
        header_match = re.match(r'(\w+)\((\d+\w*)\)\s+.*\s+(\w+)\((\d+\w*)\)', line)
        if header_match:
            metadata['command'] = header_match.group(1)
            metadata['section'] = header_match.group(2)
            break
    
    return metadata