"""
Linux man page parser module.

This module handles the parsing and conversion of traditional
Linux man pages into structured, modern formats.
"""

import re
import os
import json
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Union
from datetime import datetime


class ManPageCache:
    """Cache for storing parsed man pages."""

    def __init__(self, cache_dir: str = ".cache"):
        """Initialize the cache."""
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)

    def get_cache_key(self, content: str) -> str:
        """Generate a cache key based on content hash."""
        return hashlib.md5(content.encode()).hexdigest()

    def get_from_cache(self, cache_key: str) -> Optional[Dict]:
        """Retrieve a parsed man page from cache if it exists."""
        cache_file = self.cache_dir / f"{cache_key}.json"
        if cache_file.exists():
            with open(cache_file, "r") as f:
                return json.load(f)
        return None

    def save_to_cache(self, cache_key: str, parsed_data: Dict) -> None:
        """Save a parsed man page to cache."""
        cache_file = self.cache_dir / f"{cache_key}.json"
        with open(cache_file, "w") as f:
            json.dump(parsed_data, f)


class LinuxManParser:
    """Parser for converting Linux man pages to structured formats."""

    def __init__(self, cache_dir: str = ".cache"):
        """Initialize the parser with necessary patterns."""
        # Common patterns in man pages
        self.title_pattern = re.compile(r'\.TH\s+"?([^"]+)"?\s+(\d+)')
        self.section_pattern = re.compile(r'\.SH\s+"?([^"]*)"?')
        self.subsection_pattern = re.compile(r'\.SS\s+"?([^"]*)"?')
        self.bold_pattern = re.compile(r"\\fB([^\\]*)\\fR")
        self.italic_pattern = re.compile(r"\\fI([^\\]*)\\fR")
        self.paragraph_pattern = re.compile(r"\.PP|\.LP|\.P")
        self.indented_paragraph_pattern = re.compile(r'\.IP\s+"?([^"]*)"?(?:\s+(\d+))?')

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
            return {"title": title_match.group(1), "section": title_match.group(2)}
        # Fallback to simpler pattern if the above doesn't match
        simple_match = re.search(r"\.TH\s+([^\s]+)", content)
        if simple_match:
            return {"title": simple_match.group(1), "section": "Unknown"}
        return {"title": "Unknown", "section": "Unknown"}

    def _extract_sections(self, content: str) -> List[Dict]:
        """Extract all sections from the man page."""
        sections = []
        # Split the content by section headers
        section_matches = list(self.section_pattern.finditer(content))

        for i, match in enumerate(section_matches):
            section_name = match.group(1)
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
        # Replace bold formatting
        content = self.bold_pattern.sub(r"**\1**", content)

        # Replace italic formatting
        content = self.italic_pattern.sub(r"*\1*", content)

        # Replace paragraph markers
        content = self.paragraph_pattern.sub("\n\n", content)

        # Replace indented paragraphs
        content = self.indented_paragraph_pattern.sub(r"\n\n\1:\n    ", content)

        # Remove other common formatting commands
        content = re.sub(r"\.\w+\s+", "", content)

        return content.strip()

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
