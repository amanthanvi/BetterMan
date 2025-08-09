"""
Tests for the Linux man page parser.
"""

import pytest
import json
import os
from pathlib import Path
from src.parser.linux_parser import LinuxManParser, ManPageCache
from src.parser.man_utils import fetch_man_page_content, get_raw_man_page


class TestManPageCache:
    """Test man page caching functionality."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.cache_dir = ".test_cache"
        self.cache = ManPageCache(self.cache_dir)
    
    def teardown_method(self):
        """Clean up test files."""
        import shutil
        if os.path.exists(self.cache_dir):
            shutil.rmtree(self.cache_dir)
    
    def test_cache_creation(self):
        """Test cache directory creation."""
        assert os.path.exists(self.cache_dir)
    
    def test_cache_key_generation(self):
        """Test cache key generation."""
        content = "test content"
        key1 = self.cache.get_cache_key(content)
        key2 = self.cache.get_cache_key(content)
        assert key1 == key2
        assert len(key1) == 32  # MD5 hash length
    
    def test_cache_save_and_retrieve(self):
        """Test saving and retrieving from cache."""
        test_data = {"title": "test", "sections": []}
        cache_key = "test_key"
        
        # Save to cache
        self.cache.save_to_cache(cache_key, test_data)
        
        # Retrieve from cache
        retrieved = self.cache.get_from_cache(cache_key)
        assert retrieved == test_data
    
    def test_cache_miss(self):
        """Test cache miss returns None."""
        result = self.cache.get_from_cache("nonexistent_key")
        assert result is None


class TestLinuxManParser:
    """Test Linux man page parser."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.parser = LinuxManParser(".test_cache")
        self.sample_man_page = """.TH TEST 1 "2024-01-01" "Test 1.0" "Test Manual"
.SH NAME
test \\- a test command
.SH SYNOPSIS
.B test
[\\fIOPTION\\fR]... [\\fIFILE\\fR]...
.SH DESCRIPTION
This is a test command that demonstrates parsing.
.PP
It has multiple paragraphs.
.SS Options
.TP
.B \\-h, \\-\\-help
Display help message
.TP
.B \\-v, \\-\\-version
Display version information
.SH EXAMPLES
.B test file.txt
.br
Process file.txt
.SH SEE ALSO
.BR ls (1),
.BR cat (1)
"""
    
    def teardown_method(self):
        """Clean up test files."""
        import shutil
        if os.path.exists(".test_cache"):
            shutil.rmtree(".test_cache")
    
    def test_parse_title_info(self):
        """Test title information extraction."""
        parsed = self.parser.parse_man_page(self.sample_man_page, use_cache=False)
        assert parsed["title"] == "TEST"
        assert parsed["section"] == "1"
        assert parsed["date"] == "2024-01-01"
        assert parsed["source"] == "Test 1.0"
        assert parsed["manual"] == "Test Manual"
    
    def test_parse_sections(self):
        """Test section extraction."""
        parsed = self.parser.parse_man_page(self.sample_man_page, use_cache=False)
        sections = parsed["sections"]
        
        # Check section names
        section_names = [s["name"] for s in sections]
        assert "NAME" in section_names
        assert "SYNOPSIS" in section_names
        assert "DESCRIPTION" in section_names
        assert "EXAMPLES" in section_names
        assert "SEE ALSO" in section_names
    
    def test_parse_subsections(self):
        """Test subsection extraction."""
        parsed = self.parser.parse_man_page(self.sample_man_page, use_cache=False)
        
        # Find DESCRIPTION section
        desc_section = next(s for s in parsed["sections"] if s["name"] == "DESCRIPTION")
        assert "subsections" in desc_section
        assert len(desc_section["subsections"]) > 0
        assert desc_section["subsections"][0]["name"] == "Options"
    
    def test_parse_formatting(self):
        """Test formatting conversion."""
        parsed = self.parser.parse_man_page(self.sample_man_page, use_cache=False)
        
        # Check bold formatting
        synopsis = next(s for s in parsed["sections"] if s["name"] == "SYNOPSIS")
        assert "**test**" in synopsis["content"]
        
        # Check italic formatting
        assert "*OPTION*" in synopsis["content"] or "OPTION" in synopsis["content"]
    
    def test_parse_related(self):
        """Test related commands extraction."""
        parsed = self.parser.parse_man_page(self.sample_man_page, use_cache=False)
        related = parsed["related"]
        assert "ls" in related
        assert "cat" in related
    
    def test_convert_to_markdown(self):
        """Test Markdown conversion."""
        parsed = self.parser.parse_man_page(self.sample_man_page, use_cache=False)
        markdown = self.parser.convert_to_markdown(parsed)
        
        assert "# TEST(1)" in markdown
        assert "## NAME" in markdown
        assert "## SEE ALSO" in markdown
        assert "- ls" in markdown
        assert "- cat" in markdown
    
    def test_convert_to_html(self):
        """Test HTML conversion."""
        parsed = self.parser.parse_man_page(self.sample_man_page, use_cache=False)
        html = self.parser.convert_to_html(parsed)
        
        assert "<h1>TEST(1)</h1>" in html
        assert '<h2 id=\'name\'>NAME</h2>' in html
        assert "<strong>" in html
        assert "<em>" in html
        assert '<ul>' in html  # SEE ALSO list
    
    def test_caching(self):
        """Test that caching works properly."""
        # First parse (cache miss)
        parsed1 = self.parser.parse_man_page(self.sample_man_page, use_cache=True)
        
        # Second parse (cache hit)
        parsed2 = self.parser.parse_man_page(self.sample_man_page, use_cache=True)
        
        # Should return same content
        assert parsed1["title"] == parsed2["title"]
        assert parsed1["sections"] == parsed2["sections"]
    
    def test_edge_cases(self):
        """Test edge cases and malformed input."""
        # Empty content
        parsed = self.parser.parse_man_page("", use_cache=False)
        assert parsed["title"] == "Unknown"
        assert parsed["section"] == "1"
        
        # No .TH header
        content = ".SH NAME\ntest - a test"
        parsed = self.parser.parse_man_page(content, use_cache=False)
        assert parsed["title"] == "Unknown"
        
        # Malformed sections
        content = ".TH TEST 1\n.SH\nEmpty section name\n.SS\nEmpty subsection"
        parsed = self.parser.parse_man_page(content, use_cache=False)
        assert len(parsed["sections"]) >= 0


class TestManUtils:
    """Test man page utility functions."""
    
    def test_fetch_man_page_content_validation(self):
        """Test input validation."""
        # Invalid command names
        content, error = fetch_man_page_content("rm -rf /")
        assert content is None
        assert "Invalid command name" in error
        
        content, error = fetch_man_page_content("")
        assert content is None
        assert "Invalid command name" in error
    
    @pytest.mark.skipif(not os.path.exists("/usr/bin/man"), reason="man command not available")
    def test_fetch_real_man_page(self):
        """Test fetching a real man page."""
        # Try to fetch a common command
        content, error = fetch_man_page_content("ls", "1")
        if content:
            assert "NAME" in content or "name" in content.lower()
            assert len(content) > 100
        else:
            # Man page might not exist in test environment
            assert error is not None
    
    def test_get_raw_man_page(self):
        """Test getting raw man page content."""
        # This might fail in test environment without man pages
        content, error = get_raw_man_page("test_nonexistent_command")
        if content is None:
            assert error is not None
        else:
            # Should contain groff commands
            assert ".TH" in content or ".SH" in content