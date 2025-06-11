import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MarkdownRenderer } from '../MarkdownRenderer'; // Adjust path as needed

// Mock EnhancedCodeBlock to verify props and simplify testing
jest.mock('@/components/document/EnhancedCodeBlock', () => ({
  EnhancedCodeBlock: jest.fn(({ code, language }) => (
    <div data-testid="enhanced-code-block">
      <div data-testid="code-content">{code}</div>
      <div data-testid="code-language">{language}</div>
    </div>
  )),
}));

describe('MarkdownRenderer', () => {
  afterEach(() => {
    // Clear mocks after each test
    (require('@/components/document/EnhancedCodeBlock').EnhancedCodeBlock as jest.Mock).mockClear();
  });

  it('renders basic Markdown content', () => {
    const markdown = `
# Heading 1
Some paragraph text.
**Bold text** and *italic text*.
- List item 1
- List item 2
    `;
    render(<MarkdownRenderer content={markdown} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Heading 1' })).toBeInTheDocument();
    expect(screen.getByText('Some paragraph text.')).toBeInTheDocument();
    expect(screen.getByText('Bold text')).toBeInTheDocument();
    expect(screen.getByText('italic text')).toBeInTheDocument();
    expect(screen.getByText('List item 1')).toBeInTheDocument();
    expect(screen.getByText('List item 2')).toBeInTheDocument();
  });

  it('renders inline code correctly', () => {
    const markdown = 'This is `inline code`.';
    render(<MarkdownRenderer content={markdown} />);
    const inlineCodeElement = screen.getByText('inline code');
    expect(inlineCodeElement).toBeInTheDocument();
    expect(inlineCodeElement.tagName).toBe('CODE');
  });

  it('delegates fenced code blocks to EnhancedCodeBlock with language', () => {
    const markdown = "```javascript\nconst x = 10;\nconsole.log(x);\n```";
    render(<MarkdownRenderer content={markdown} darkMode={true} />);

    const EnhancedCodeBlockMock = require('@/components/document/EnhancedCodeBlock').EnhancedCodeBlock;

    expect(EnhancedCodeBlockMock).toHaveBeenCalledTimes(1);
    expect(EnhancedCodeBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'const x = 10;\nconsole.log(x);', // react-markdown removes trailing newline
        language: 'javascript',
        showTryIt: true,
      }),
      {}
    );
    // Check if the mock's output is rendered (optional, but good for confidence)
    expect(screen.getByTestId('enhanced-code-block')).toBeInTheDocument();
    expect(screen.getByTestId('code-content')).toHaveTextContent('const x = 10;\nconsole.log(x);');
    expect(screen.getByTestId('code-language')).toHaveTextContent('javascript');
  });

  it('delegates fenced code blocks without language to EnhancedCodeBlock', () => {
    const markdown = "```\nSome plain text code block\n```";
    render(<MarkdownRenderer content={markdown} />);

    const EnhancedCodeBlockMock = require('@/components/document/EnhancedCodeBlock').EnhancedCodeBlock;

    expect(EnhancedCodeBlockMock).toHaveBeenCalledTimes(1);
    expect(EnhancedCodeBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'Some plain text code block',
        language: undefined, // or 'text' depending on how EnhancedCodeBlock handles it internally
        showTryIt: false,
      }),
      {}
    );
     expect(screen.getByTestId('enhanced-code-block')).toBeInTheDocument();
     expect(screen.getByTestId('code-content')).toHaveTextContent('Some plain text code block');
  });

  it('applies dark mode styles (superficial check, actual styling is CSS)', () => {
    // We can check if the 'dark:prose-invert' class is applied.
    const markdown = "Test content";
    const { container } = render(<MarkdownRenderer content={markdown} darkMode={true} />);
    // The prose class is usually applied to the direct child of the renderer's div
    expect(container.firstChild).toHaveClass('dark:prose-invert');
  });

  it('applies font size classes', () => {
    const markdown = "Test content";
    const { container, rerender } = render(<MarkdownRenderer content={markdown} fontSize="sm" />);
    expect(container.firstChild).toHaveClass('prose-sm');

    rerender(<MarkdownRenderer content={markdown} fontSize="lg" />);
    expect(container.firstChild).toHaveClass('prose-lg');
  });

  // Test for the custom paragraph 'p' component override for options-like text
  // This is a more specific test for the custom component logic within MarkdownRenderer
  it('renders option-like paragraphs with custom styling', () => {
    const markdown = '-f, --foo   Description for foo';
    render(<MarkdownRenderer content={markdown} />);

    // Check if the custom structure is rendered
    // (the mock for EnhancedCodeBlock won't interfere here)
    expect(screen.getByText('-f, --foo')).toBeInTheDocument();
    expect(screen.getByText('-f, --foo').tagName).toBe('CODE');
    expect(screen.getByText('Description for foo')).toBeInTheDocument();
  });

  it('renders normal paragraphs without applying option styling', () => {
    const markdown = 'This is a normal paragraph.';
    render(<MarkdownRenderer content={markdown} />);
    const paragraph = screen.getByText('This is a normal paragraph.');
    expect(paragraph).toBeInTheDocument();
    expect(paragraph.tagName).toBe('P');
    // Ensure it doesn't have the flex structure of the option-like paragraphs
    expect(paragraph).not.toHaveClass('flex');
  });

});
