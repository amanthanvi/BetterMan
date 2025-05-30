"""
Tests for the groff parser module.
"""

import pytest
from src.parser.groff_parser import GroffParser, FontStyle, parse_groff_content


class TestGroffParser:
    """Test groff parser functionality."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.parser = GroffParser()
    
    def test_basic_font_changes(self):
        """Test basic font change sequences."""
        # Bold
        content = r"\fBbold text\fR normal text"
        result = parse_groff_content(content)
        assert result == "**bold text** normal text"
        
        # Italic
        content = r"\fIitalic text\fR normal text"
        result = parse_groff_content(content)
        assert result == "*italic text* normal text"
        
        # Mixed
        content = r"\fBbold\fR and \fIitalic\fR text"
        result = parse_groff_content(content)
        assert result == "**bold** and *italic* text"
    
    def test_nested_font_changes(self):
        """Test nested and complex font changes."""
        # Previous font
        content = r"\fBbold \fIitalic\fP back to bold\fR"
        result = parse_groff_content(content)
        assert "**bold" in result
        assert "*italic*" in result
        
    def test_escape_sequences(self):
        """Test common escape sequences."""
        # Hyphen
        content = r"command\-line option"
        result = parse_groff_content(content)
        assert result == "command-line option"
        
        # Em dash
        content = r"text\(emmore text"
        result = parse_groff_content(content)
        assert result == "text—more text"
        
        # Quotes
        content = r"\(lqquoted text\(rq"
        result = parse_groff_content(content)
        assert result == ""quoted text""
    
    def test_special_characters(self):
        """Test special character handling."""
        # Copyright
        content = r"Copyright \(co 2024"
        result = parse_groff_content(content)
        assert result == "Copyright © 2024"
        
        # Trademark
        content = r"Product\(tm Name"
        result = parse_groff_content(content)
        assert result == "Product™ Name"
    
    def test_overstriking(self):
        """Test overstrike sequences."""
        # Bold via overstrike
        content = "t\x08te\x08es\x08st\x08t"
        result = parse_groff_content(content)
        assert "**test**" in result
        
        # Underline via overstrike
        content = "_\x08t_\x08e_\x08s_\x08t"
        result = parse_groff_content(content)
        assert "*test*" in result
    
    def test_unicode_handling(self):
        """Test Unicode character handling."""
        # UTF-8 content
        content = "Test with émojis 🚀 and spëcial chars"
        result = parse_groff_content(content)
        assert "émojis 🚀" in result
        assert "spëcial" in result
    
    def test_empty_and_edge_cases(self):
        """Test edge cases and empty content."""
        # Empty content
        assert parse_groff_content("") == ""
        
        # Only escape sequences
        content = r"\fB\fR\fI\fR"
        result = parse_groff_content(content)
        assert result.strip() == ""
        
        # Malformed sequences
        content = r"\fXinvalid\fR normal"
        result = parse_groff_content(content)
        assert "normal" in result


class TestFontStyle:
    """Test FontStyle enum."""
    
    def test_font_style_values(self):
        """Test font style enum values."""
        assert FontStyle.ROMAN.value == 'R'
        assert FontStyle.BOLD.value == 'B'
        assert FontStyle.ITALIC.value == 'I'
        assert FontStyle.SYMBOL.value == 'S'
        assert FontStyle.CONSTANT_WIDTH.value == 'CW'
        assert FontStyle.PREVIOUS.value == 'P'