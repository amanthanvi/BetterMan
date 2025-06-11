import {
  parseGroffContent,
  parseSectionName,
  parseGroffSections,
  groffToMarkdown,
  hasGroffFormatting,
  cleanAnsiSequences,
} from '../groffParser';

describe('groffParser', () => {
  describe('cleanAnsiSequences', () => {
    it('should remove ANSI escape sequences', () => {
      const content = '\x1b[31mRed\x1b[0m Normal \x1b[1mBold\x1b[0m';
      expect(cleanAnsiSequences(content)).toBe('Red Normal Bold');
    });
    it('should handle bold and underline sequences', () => {
      const content = 'N\x08No\x08or\x08rm\x08ma\x08al\x08l T\x08Te\x08ex\x08xt\x08t, _\x08U_\x08Un\x08nd\x08de\x08er\x08rl\x08li\x08in\x08ne\x08e';
      // This specific type of bold/underline might depend on the exact implementation details
      // of cleanAnsiSequences. For this example, I assume it handles simple cases.
      expect(cleanAnsiSequences(content)).toBe('Normal Text, Underline');
    });
    it('should return empty string for empty input', () => {
        expect(cleanAnsiSequences('')).toBe('');
    });
  });

  describe('parseGroffContent', () => {
    it('should handle basic groff commands', () => {
      const content = `
.SH NAME
Test Command - a test command
.SH SYNOPSIS
.B Test Command
.I [options]
.SH DESCRIPTION
This is a test.
.PP
Another paragraph.
      `;
      const expectedText = "NAME\nTest Command - a test command\nSYNOPSIS\nTest Command\n[options]\nDESCRIPTION\nThis is a test.\n\nAnother paragraph.";
      expect(parseGroffContent(content).replace(/\n\s*\n/g, '\n\n')).toBe(expectedText);
    });

    it('should convert to markdown if option is set', () => {
      const content = `
.SH HELLO
.B Bold Text
.I Italic Text
      `;
      const expectedMarkdown = "## HELLO\n**Bold Text**\n*Italic Text*";
      expect(groffToMarkdown(content).replace(/\n\s*\n/g, '\n\n')).toBe(expectedMarkdown);
    });

    it('should preserve formatting for code blocks (.nf/.fi)', () => {
        const content = `
Text before.
.nf
  This is a code block.
    Indented further.
.fi
Text after.
        `;
        const expected = "Text before.\n\n```\n  This is a code block.\n    Indented further.\n```\n\nText after.";
        expect(parseGroffContent(content, { convertToMarkdown: true }).replace(/\n\s*\n/g, '\n\n')).toBe(expected);
    });

    it('should preserve formatting for .EX/.EE blocks', () => {
        const content = `
.EX
example code
.EE
        `;
        const expected = "```\nexample code\n```";
        expect(parseGroffContent(content, { convertToMarkdown: true }).replace(/\n\s*\n/g, '\n\n')).toBe(expected);
    });

    it('should handle inline formatting \\fB, \\fI, \\fR', () => {
      const content = "This is \\fBbold\\fR and this is \\fIitalic\\fR.";
      const expectedText = "This is bold and this is italic.";
      const expectedMarkdown = "This is **bold** and this is *italic*.";
      expect(parseGroffContent(content)).toBe(expectedText);
      expect(groffToMarkdown(content)).toBe(expectedMarkdown);
    });

    it('should return empty string for empty content', () => {
        expect(parseGroffContent('')).toBe('');
    });

    it('should handle undefined content by returning empty string', () => {
        expect(parseGroffContent(undefined as any)).toBe('');
    });

  });

  describe('parseSectionName', () => {
    it('should clean basic section names', () => {
      expect(parseSectionName('NAME')).toBe('Name');
      expect(parseSectionName('USER COMMANDS')).toBe('User Commands');
    });

    it('should remove groff formatting from section names', () => {
      expect(parseSectionName('.SH "SYNOPSIS"')).toBe('Synopsis');
      expect(parseSectionName('\\fBOPTIONS\\fR')).toBe('Options');
    });

    it('should return empty string for empty or invalid name', () => {
        expect(parseSectionName('')).toBe('');
        expect(parseSectionName('.SH ""')).toBe('');
        expect(parseSectionName(undefined as any)).toBe('');
    });
  });

  describe('parseGroffSections', () => {
    const sections = [
      { name: '.SH "FIRST SECTION"', content: "Content of \\fBfirst\\fR section." },
      { name: 'SECOND SECTION', content: "Content of second.", subsections: [
        { name: '.SS "SUB ONE"', content: "Subsection one."}
      ]},
      { name: '', content: "Should be filtered out"}, // Invalid name
      { name: 'THIRD SECTION', content: undefined } // Undefined content
    ];

    it('should parse sections and their names', () => {
      const parsed = parseGroffSections(sections);
      expect(parsed).toHaveLength(3); // "Should be filtered out" is removed
      expect(parsed[0].name).toBe('First Section');
      expect(parsed[0].content).toBe('Content of first section.');
      expect(parsed[1].name).toBe('Second Section');
    });

    it('should parse subsections', () => {
      const parsed = parseGroffSections(sections);
      expect(parsed[1].subsections).toHaveLength(1);
      expect(parsed[1].subsections[0].name).toBe('Sub One');
      expect(parsed[1].subsections[0].content).toBe('Subsection one.');
    });

    it('should handle undefined content in sections by parsing to empty string', () => {
        const parsed = parseGroffSections(sections);
        expect(parsed[2].name).toBe('Third Section');
        expect(parsed[2].content).toBe('');
    });

    it('should convert content to markdown if specified', () => {
      const parsed = parseGroffSections(sections, { convertToMarkdown: true });
      expect(parsed[0].content).toBe('Content of **first** section.');
      expect(parsed[1].subsections[0].content).toBe('Subsection one.');
    });

    it('should return empty array for empty or invalid input', () => {
        expect(parseGroffSections([])).toEqual([]);
        expect(parseGroffSections(undefined as any)).toEqual([]);
        expect(parseGroffSections([{content: "test"}])).toEqual([]); // No name
    });
  });

  describe('hasGroffFormatting', () => {
    it('should detect groff commands', () => {
      expect(hasGroffFormatting('.SH HELLO')).toBe(true);
    });
    it('should detect font changes', () => {
      expect(hasGroffFormatting('\\fBbold')).toBe(true);
    });
    it('should return false for plain text', () => {
      expect(hasGroffFormatting('This is plain text.')).toBe(false);
    });
     it('should return false for empty or undefined input', () => {
      expect(hasGroffFormatting('')).toBe(false);
      expect(hasGroffFormatting(undefined as any)).toBe(false);
    });
  });
});
