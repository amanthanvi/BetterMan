"""
Linux man page parser module.

This module handles the parsing and conversion of traditional
Linux man pages into structured, modern formats.
"""

import re
import os
import json
import hashlib
import logging
from pathlib import Path
from typing import Dict, List, Optional, Union
from datetime import datetime
from .enhanced_groff_parser import clean_groff_content, EnhancedGroffParser

# Configure logging
logger = logging.getLogger(__name__)


class ManPageCache:
    """Cache for storing parsed man pages."""

    def __init__(self, cache_dir: str = ".cache"):
        """Initialize the cache."""
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)

    def get_cache_key(self, content: str) -> str:
        """Generate a cache key based on content hash."""
        return hashlib.md5(content.encode('utf-8')).hexdigest()

    def get_from_cache(self, cache_key: str) -> Optional[Dict]:
        """Retrieve a parsed man page from cache if it exists."""
        cache_file = self.cache_dir / f"{cache_key}.json"
        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load cache file {cache_file}: {e}")
                return None
        return None

    def save_to_cache(self, cache_key: str, parsed_data: Dict) -> None:
        """Save a parsed man page to cache."""
        cache_file = self.cache_dir / f"{cache_key}.json"
        try:
            with open(cache_file, "w", encoding='utf-8') as f:
                json.dump(parsed_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save cache file {cache_file}: {e}")


class LinuxManParser:
    """Parser for converting Linux man pages to structured formats."""

    def __init__(self, cache_dir: str = ".cache"):
        """Initialize the parser with necessary patterns."""
        # Common patterns in man pages
        self.title_pattern = re.compile(r'\.TH\s+"?([^"\s]+)"?\s+([^"\s]+)(?:\s+"([^"]*)")?(?:\s+"([^"]*)")?(?:\s+"([^"]*)")?')
        self.section_pattern = re.compile(r'^\.SH\s+"?([^"]*)"?\s*$', re.MULTILINE)
        self.subsection_pattern = re.compile(r'^\.SS\s+"?([^"]*)"?\s*$', re.MULTILINE)
        self.paragraph_pattern = re.compile(r'^\.(?:PP|LP|P|br)\s*$', re.MULTILINE)
        self.indented_paragraph_pattern = re.compile(r'^\.IP\s+"?([^"]*)"?(?:\s+(\d+))?\s*$', re.MULTILINE)
        self.tagged_paragraph_pattern = re.compile(r'^\.TP(?:\s+(\d+))?\s*$', re.MULTILINE)
        self.relative_indent_pattern = re.compile(r'^\.RS(?:\s+(\d+))?\s*$', re.MULTILINE)
        self.relative_dedent_pattern = re.compile(r'^\.RE\s*$', re.MULTILINE)
        
        # Macro patterns
        self.macro_patterns = {
            'bold': re.compile(r'^\.B\s+(.+)$', re.MULTILINE),
            'italic': re.compile(r'^\.I\s+(.+)$', re.MULTILINE),
            'bold_italic': re.compile(r'^\.BI\s+(.+)$', re.MULTILINE),
            'roman_bold': re.compile(r'^\.RB\s+(.+)$', re.MULTILINE),
            'bold_roman': re.compile(r'^\.BR\s+(.+)$', re.MULTILINE),
            'italic_bold': re.compile(r'^\.IB\s+(.+)$', re.MULTILINE),
            'italic_roman': re.compile(r'^\.IR\s+(.+)$', re.MULTILINE),
            'roman_italic': re.compile(r'^\.RI\s+(.+)$', re.MULTILINE),
        }

        # Initialize cache
        self.cache = ManPageCache(cache_dir)

    def parse_man_page(self, content: str, use_cache: bool = True) -> Dict:
        """
        Parse a raw man page into a structured format.

        Args:
            content: Raw man page content as a string.
            use_cache: Whether to use the cache.

        Returns:
            Dict containing structured man page content.
        """
        # Check if we have a cached version
        if use_cache:
            cache_key = self.cache.get_cache_key(content)
            cached_data = self.cache.get_from_cache(cache_key)
            if cached_data:
                return cached_data

        # Extract the title and man page section
        title_info = self._extract_title_info(content)

        # Extract all sections
        sections = self._extract_sections(content)

        # Extract related commands
        related = self._extract_related(content)

        # Basic structure for a parsed man page
        parsed_data = {
            "title": title_info["title"],
            "section": title_info["section"],
            "date": title_info.get("date", ""),
            "source": title_info.get("source", ""),
            "manual": title_info.get("manual", ""),
            "sections": sections,
            "related": related,
            "parsed_at": datetime.now().isoformat(),
        }

        # Save to cache if requested
        if use_cache:
            cache_key = self.cache.get_cache_key(content)
            self.cache.save_to_cache(cache_key, parsed_data)

        return parsed_data

    def _extract_title_info(self, content: str) -> Dict:
        """Extract the title and section from a man page."""
        title_match = self.title_pattern.search(content)
        if title_match:
            title = title_match.group(1)
            section = title_match.group(2)
            # Additional metadata if available
            date = title_match.group(3) if title_match.group(3) else ""
            source = title_match.group(4) if title_match.group(4) else ""
            manual = title_match.group(5) if title_match.group(5) else ""
            
            return {
                "title": title,
                "section": section,
                "date": date,
                "source": source,
                "manual": manual
            }
        
        # Fallback to simpler pattern if the above doesn't match
        simple_match = re.search(r"\.TH\s+([^\s]+)(?:\s+([^\s]+))?", content)
        if simple_match:
            return {
                "title": simple_match.group(1),
                "section": simple_match.group(2) if simple_match.group(2) else "1",
                "date": "",
                "source": "",
                "manual": ""
            }
        
        return {
            "title": "Unknown",
            "section": "1",
            "date": "",
            "source": "",
            "manual": ""
        }

    def _extract_sections(self, content: str) -> List[Dict]:
        """Extract all sections from the man page."""
        sections = []
        # Split the content by section headers
        section_matches = list(self.section_pattern.finditer(content))

        for i, match in enumerate(section_matches):
            section_name = match.group(1)
            # Clean the section name with enhanced parser
            section_name = clean_groff_content(section_name).strip()
            section_start = match.end()

            # Determine the end of the section
            if i < len(section_matches) - 1:
                section_end = section_matches[i + 1].start()
            else:
                section_end = len(content)

            # Extract section content
            section_content = content[section_start:section_end].strip()

            # Process section content (replace formatting commands, etc.)
            processed_content = self._process_section_content(section_content)

            # Extract subsections if any
            subsections = self._extract_subsections(section_content)

            section_data = {
                "name": section_name,
                "content": processed_content,
            }

            if subsections:
                section_data["subsections"] = subsections

            sections.append(section_data)

        return sections

    def _extract_subsections(self, section_content: str) -> List[Dict]:
        """Extract subsections from a section's content."""
        subsections = []
        subsection_matches = list(self.subsection_pattern.finditer(section_content))

        for i, match in enumerate(subsection_matches):
            subsection_name = match.group(1)
            # Clean the subsection name with enhanced parser
            subsection_name = clean_groff_content(subsection_name).strip()
            subsection_start = match.end()

            # Determine the end of the subsection
            if i < len(subsection_matches) - 1:
                subsection_end = subsection_matches[i + 1].start()
            else:
                subsection_end = len(section_content)

            # Extract subsection content
            subsection_content = section_content[
                subsection_start:subsection_end
            ].strip()

            # Process subsection content
            processed_content = self._process_section_content(subsection_content)

            subsections.append(
                {
                    "name": subsection_name,
                    "content": processed_content,
                }
            )

        return subsections

    def _process_section_content(self, content: str) -> str:
        """Process section content to replace formatting commands."""
        # Use the enhanced groff parser to clean all formatting
        content = clean_groff_content(content)
        
        # Normalize whitespace
        content = re.sub(r'\n{3,}', '\n\n', content)
        content = re.sub(r'[ \t]+', ' ', content)
        
        return content.strip()
    
    def _process_macros(self, content: str) -> str:
        """Process groff macros for formatting."""
        # Process single-line formatting macros
        content = self.macro_patterns['bold'].sub(r'**\1**', content)
        content = self.macro_patterns['italic'].sub(r'*\1*', content)
        
        # Process alternating format macros
        def process_alternating(match, formats):
            words = match.group(1).split()
            result = []
            for i, word in enumerate(words):
                fmt = formats[i % len(formats)]
                if fmt == 'B':
                    result.append(f'**{word}**')
                elif fmt == 'I':
                    result.append(f'*{word}*')
                else:
                    result.append(word)
            return ' '.join(result)
        
        content = self.macro_patterns['bold_italic'].sub(
            lambda m: process_alternating(m, ['B', 'I']), content)
        content = self.macro_patterns['roman_bold'].sub(
            lambda m: process_alternating(m, ['R', 'B']), content)
        content = self.macro_patterns['bold_roman'].sub(
            lambda m: process_alternating(m, ['B', 'R']), content)
        content = self.macro_patterns['italic_bold'].sub(
            lambda m: process_alternating(m, ['I', 'B']), content)
        content = self.macro_patterns['italic_roman'].sub(
            lambda m: process_alternating(m, ['I', 'R']), content)
        content = self.macro_patterns['roman_italic'].sub(
            lambda m: process_alternating(m, ['R', 'I']), content)
        
        return content
    
    def _process_paragraph_macros(self, content: str) -> str:
        """Process paragraph and indentation macros."""
        # Replace paragraph markers
        content = self.paragraph_pattern.sub('\n\n', content)
        
        # Handle indented paragraphs
        def replace_ip(match):
            label = match.group(1) if match.group(1) else ""
            indent = match.group(2) if match.group(2) else "4"
            if label:
                return f"\n\n{label}:\n    "
            else:
                return "\n\n    "
        
        content = self.indented_paragraph_pattern.sub(replace_ip, content)
        
        # Handle tagged paragraphs
        lines = content.split('\n')
        result = []
        i = 0
        while i < len(lines):
            if self.tagged_paragraph_pattern.match(lines[i]):
                # Next line is the tag, line after is the content
                if i + 1 < len(lines):
                    tag = lines[i + 1].strip()
                    content_start = i + 2
                    # Find where this paragraph ends
                    para_end = content_start
                    while para_end < len(lines) and not lines[para_end].startswith('.'):
                        para_end += 1
                    
                    if content_start < len(lines):
                        para_content = ' '.join(lines[content_start:para_end])
                        result.append(f"\n{tag}:\n    {para_content}")
                        i = para_end
                        continue
            result.append(lines[i])
            i += 1
        
        content = '\n'.join(result)
        
        # Handle relative indents
        content = self.relative_indent_pattern.sub('    ', content)
        content = self.relative_dedent_pattern.sub('', content)
        
        return content
    
    def _clean_remaining_macros(self, content: str) -> str:
        """Remove remaining groff macros that don't affect content."""
        # List of macros to remove completely
        remove_macros = [
            r'^\.(?:ad|ce|de|di|ev|ex|fi|ft|hy|in|it|ll|ls|na|ne|nf|nh|nr|ns|pl|po|ps|so|sp|ta|ti|tm|tr)\b.*$',
            r'^\.\\".*$',  # Comments
            r'^\.\\}.*$',  # Conditional end
            r'^\.ds\s+.*$',  # Define string
            r'^\.if\s+.*$',  # Conditionals
            r'^\.ie\s+.*$',  # If-else
            r'^\.el\s+.*$',  # Else
        ]
        
        for pattern in remove_macros:
            content = re.sub(pattern, '', content, flags=re.MULTILINE)
        
        return content

    def _extract_related(self, content: str) -> List[str]:
        """Extract related commands or pages referenced in SEE ALSO section."""
        related = []
        # Find the SEE ALSO section
        see_also_match = re.search(
            r'\.SH\s+"?SEE ALSO"?(.*?)(?:\.SH|$)', content, re.DOTALL
        )

        if see_also_match:
            see_also_content = see_also_match.group(1)
            # Extract command names, which are often in bold or followed by section numbers
            command_matches = re.finditer(
                r"\\fB([^\\]+)\\fR(?:\s*\((\d+)\))?", see_also_content
            )
            for match in command_matches:
                command = match.group(1).strip()
                related.append(command)

        return related

    def convert_to_markdown(self, parsed_data: Dict) -> str:
        """Convert parsed man page data to Markdown format."""
        markdown = f"# {parsed_data['title']}({parsed_data['section']})\n\n"

        for section in parsed_data["sections"]:
            markdown += f"## {section['name']}\n\n"
            markdown += f"{section['content']}\n\n"

            if "subsections" in section:
                for subsection in section["subsections"]:
                    markdown += f"### {subsection['name']}\n\n"
                    markdown += f"{subsection['content']}\n\n"

        if parsed_data["related"]:
            markdown += "## SEE ALSO\n\n"
            for item in parsed_data["related"]:
                markdown += f"- {item}\n"

        return markdown

    def convert_to_html(self, parsed_data: Dict) -> str:
        """Convert parsed man page data to HTML format."""
        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>{parsed_data['title']}({parsed_data['section']})</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; padding: 1em; max-width: 80ch; margin: 0 auto; }}
        h1 {{ border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }}
        h2 {{ border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; margin-top: 24px; }}
        pre {{ background-color: #f6f8fa; border-radius: 3px; padding: 16px; overflow: auto; }}
        code {{ font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace; }}
        @media (prefers-color-scheme: dark) {{
            body {{ background-color: #0d1117; color: #c9d1d9; }}
            h1, h2, h3 {{ color: #e6edf3; border-color: #30363d; }}
            pre {{ background-color: #161b22; }}
            code {{ color: #e6edf3; }}
            a {{ color: #58a6ff; }}
        }}
    </style>
</head>
<body>
    <h1>{parsed_data['title']}({parsed_data['section']})</h1>
"""

        for section in parsed_data["sections"]:
            html += f"<h2 id='{section['name'].lower().replace(' ', '-')}'>{section['name']}</h2>\n"

            # Convert simple Markdown-like formatting to HTML
            content = section["content"]
            content = re.sub(
                r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", content
            )  # Bold
            content = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", content)  # Italic
            content = re.sub(r"\n\n", r"</p><p>", content)  # Paragraphs

            html += f"<p>{content}</p>\n"

            if "subsections" in section:
                for subsection in section["subsections"]:
                    html += f"<h3 id='{section['name'].lower().replace(' ', '-')}-{subsection['name'].lower().replace(' ', '-')}'>{subsection['name']}</h3>\n"

                    # Convert subsection content formatting to HTML
                    subcontent = subsection["content"]
                    subcontent = re.sub(
                        r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", subcontent
                    )
                    subcontent = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", subcontent)
                    subcontent = re.sub(r"\n\n", r"</p><p>", subcontent)

                    html += f"<p>{subcontent}</p>\n"

        if parsed_data["related"]:
            html += "<h2 id='see-also'>SEE ALSO</h2>\n<ul>\n"
            for item in parsed_data["related"]:
                html += f"<li>{item}</li>\n"
            html += "</ul>\n"

        html += """</body>
</html>"""

        return html
