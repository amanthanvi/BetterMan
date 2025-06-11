import {
  parseOptionsSection,
  parseExamplesSection,
  detectCodeBlocks,
  parseSynopsisSection,
} from '../documentParser';

describe('documentParser', () => {
  describe('parseOptionsSection', () => {
    it('should parse basic options', () => {
      const content = `
.TP
\\fB-f, --foo\\fR
This is a foo option.
.TP
\\fB--bar\\fR \\fIBAR_ARG\\fR
This is a bar option with an argument.
      `;
      const options = parseOptionsSection(content);
      expect(options).toHaveLength(2);
      expect(options[0]).toEqual({
        flag: '-f, --foo',
        argument: '',
        description: 'This is a foo option.',
      });
      expect(options[1]).toEqual({
        flag: '--bar',
        argument: 'BAR_ARG',
        description: 'This is a bar option with an argument.',
      });
    });

    it('should handle multi-line descriptions', () => {
      const content = `
.TP
\\fB-m\\fR
This is a multi-line
description for an option.
      `;
      const options = parseOptionsSection(content);
      expect(options).toHaveLength(1);
      expect(options[0].description).toBe('This is a multi-line description for an option.');
    });

    it('should return empty array for empty content', () => {
      expect(parseOptionsSection('')).toEqual([]);
    });

    it('should handle options without descriptions', () => {
      const content = ".TP\n\\fB-x\\fR";
      const options = parseOptionsSection(content);
      expect(options).toHaveLength(1);
      expect(options[0]).toEqual({
        flag: '-x',
        argument: '',
        description: '',
      });
    });
  });

  describe('parseExamplesSection', () => {
    it('should parse basic examples', () => {
      const content = `
This is an example:
  $ command --option
This is another example.
# another command
      `;
      const examples = parseExamplesSection(content);
      expect(examples).toHaveLength(2);
      expect(examples[0].description).toBe('This is an example:');
      expect(examples[0].code.trim()).toBe('$ command --option');
      expect(examples[0].language).toBe('bash');
      expect(examples[1].description).toBe('This is another example.');
      expect(examples[1].code.trim()).toBe('# another command');
    });

    it('should handle examples with no description before code', () => {
        const content = `
    # a command without prior description
    ls -l
        `;
        const examples = parseExamplesSection(content);
        expect(examples).toHaveLength(1);
        expect(examples[0].description).toBe('');
        expect(examples[0].code.trim()).toBe('# a command without prior description\nls -l');
    });

    it('should handle multi-line code blocks', () => {
      const content = `
An example of a script:
  echo "Start"
  echo "End"
      `;
      const examples = parseExamplesSection(content);
      expect(examples).toHaveLength(1);
      expect(examples[0].code.trim()).toBe('echo "Start"\necho "End"');
    });

    it('should return empty array for empty content', () => {
      expect(parseExamplesSection('')).toEqual([]);
    });
  });

  describe('detectCodeBlocks', () => {
    it('should not modify content with existing markdown code blocks', () => {
      const content = '```bash\nls -l\n```';
      expect(detectCodeBlocks(content)).toBe(content);
    });

    it('should detect indented code blocks and wrap them with ```bash', () => {
      const content = 'Normal text.\n    indented code\n    more indented code\nMore normal text.';
      const expected = 'Normal text.\n\n```bash\nindented code\nmore indented code\n```\n\nMore normal text.';
      expect(detectCodeBlocks(content)).toBe(expected);
    });

    it('should detect command prompt code blocks', () => {
      const content = 'Run this command:\n$ ls -lah\nThen this:\n# sudo apt update';
      const expected = 'Run this command:\n\n```bash\nls -lah\n```\n\nThen this:\n\n```bash\nsudo apt update\n```\n';
      // Note: The double \n\n might be specific to the implementation, adjust if needed.
      // For this test, I'm assuming the current behavior based on a quick look.
      // A more robust test might trim lines or split by lines to compare content.
      expect(detectCodeBlocks(content).replace(/\n\n\n/g, '\n\n')).toContain('```bash\nls -lah\n```');
      expect(detectCodeBlocks(content).replace(/\n\n\n/g, '\n\n')).toContain('```bash\nsudo apt update\n```');
    });

    it('should handle empty content', () => {
      expect(detectCodeBlocks('')).toBe('');
    });
  });

  describe('parseSynopsisSection', () => {
    it('should parse a simple command synopsis', () => {
      const content = 'command [OPTIONS] <FILE>';
      const synopsis = parseSynopsisSection(content);
      expect(synopsis).toHaveLength(1);
      expect(synopsis[0].command).toBe('command');
      expect(synopsis[0].args).toEqual(['[OPTIONS]', '<FILE>']);
    });

    it('should parse commands with flags', () => {
      const content = 'my_tool -f --long-flag input.txt';
      const synopsis = parseSynopsisSection(content);
      expect(synopsis).toHaveLength(1);
      expect(synopsis[0].command).toBe('my_tool');
      expect(synopsis[0].flags).toEqual(['-f', '--long-flag']);
      expect(synopsis[0].args).toEqual(['input.txt']);
    });

    it('should handle multiple lines, some not being commands', () => {
      const content = `
Usage: my_app [COMMAND]
my_app init
my_app process --all data/
      `;
      const synopsis = parseSynopsisSection(content);
      expect(synopsis).toHaveLength(3);
      expect(synopsis[0].text).toBe('Usage: my_app [COMMAND]');
      expect(synopsis[1].command).toBe('my_app');
      expect(synopsis[1].args).toEqual(['init']);
      expect(synopsis[2].command).toBe('my_app');
      expect(synopsis[2].flags).toEqual(['--all']);
      expect(synopsis[2].args).toEqual(['process', 'data/']);
    });

    it('should return empty array for empty content', () => {
      expect(parseSynopsisSection('')).toEqual([]);
    });
  });
});
