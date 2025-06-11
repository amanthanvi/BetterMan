import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnhancedCodeBlock } from '../EnhancedCodeBlock'; // Adjust path as needed
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'; // To check props

// Mock react-syntax-highlighter to verify props
jest.mock('react-syntax-highlighter', () => ({
  Prism: jest.fn(({ children }) => <pre>{children}</pre>),
}));

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Copy: () => <svg>Copy</svg>,
  Check: () => <svg>Check</svg>,
}));

// Mock TryItButton
jest.mock('../TryItButton', () => ({
  TryItButton: jest.fn(() => <button>Try It!</button>),
}));

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
  writable: true,
});

describe('EnhancedCodeBlock', () => {
  const mockCode = 'const greeting = "Hello, world!";';
  const mockLanguage = 'javascript';

  beforeEach(() => {
    // Clear mocks before each test
    (SyntaxHighlighter as jest.Mock).mockClear();
    (navigator.clipboard.writeText as jest.Mock).mockClear();
    (require('../TryItButton').TryItButton as jest.Mock).mockClear();
  });

  it('renders the code using SyntaxHighlighter', () => {
    render(<EnhancedCodeBlock code={mockCode} language={mockLanguage} />);
    expect(SyntaxHighlighter).toHaveBeenCalledTimes(1);
    expect(SyntaxHighlighter).toHaveBeenCalledWith(
      expect.objectContaining({
        children: mockCode,
        language: mockLanguage,
        style: expect.any(Object), // oneDark theme
      }),
      {}
    );
    expect(screen.getByText(mockCode)).toBeInTheDocument();
  });

  it('shows line numbers if prop is passed', () => {
    render(<EnhancedCodeBlock code={mockCode} language={mockLanguage} showLineNumbers={true} />);
    expect(SyntaxHighlighter).toHaveBeenCalledWith(
      expect.objectContaining({
        showLineNumbers: true,
      }),
      {}
    );
  });

  it('defaults language to "text" if not provided', () => {
    render(<EnhancedCodeBlock code="Plain text" />);
    expect(SyntaxHighlighter).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'text',
      }),
      {}
    );
  });

  describe('Copy button', () => {
    it('appears on hover (simulated by group-hover class)', () => {
      // Note: Testing hover effects directly is tricky without a browser environment.
      // We assume the CSS for group-hover:opacity-100 works.
      // We can check if the button is rendered.
      render(<EnhancedCodeBlock code={mockCode} language={mockLanguage} />);
      expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
    });

    it('copies code to clipboard when clicked', async () => {
      render(<EnhancedCodeBlock code={mockCode} language={mockLanguage} />);
      const copyButton = screen.getByRole('button', { name: /Copy/i });

      fireEvent.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockCode);
      // Check for "Copied" state (icon changes, text changes)
      // Depending on implementation, this might involve waiting for state update
      expect(await screen.findByText(/Copied/i)).toBeInTheDocument();
      expect(screen.queryByText(/Copy/i)).not.toBeInTheDocument(); // Original text might be gone

      // Check if it reverts after timeout
      await new Promise(r => setTimeout(r, 2100)); // Wait for timeout + buffer
      expect(screen.getByText(/Copy/i)).toBeInTheDocument();
    });
  });

  describe('Try It button', () => {
    const shellCode = '$ ls -l';
    const shellLang = 'bash';

    it('renders TryItButton for shell commands when showTryIt is true', () => {
      render(<EnhancedCodeBlock code={shellCode} language={shellLang} showTryIt={true} />);
      expect(require('../TryItButton').TryItButton).toHaveBeenCalledTimes(1);
      expect(require('../TryItButton').TryItButton).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'ls -l', // Extracted command
        }),
        {}
      );
    });

    it('does not render TryItButton if showTryIt is false', () => {
      render(<EnhancedCodeBlock code={shellCode} language={shellLang} showTryIt={false} />);
      expect(require('../TryItButton').TryItButton).not.toHaveBeenCalled();
    });

    it('does not render TryItButton for non-shell languages', () => {
      render(<EnhancedCodeBlock code={mockCode} language={mockLanguage} showTryIt={true} />);
      expect(require('../TryItButton').TryItButton).not.toHaveBeenCalled();
    });

    it('extracts command correctly from multi-line scripts', () => {
        const multiLineCode = '$ echo "hello"\n# comment\n$ echo "world"';
        render(<EnhancedCodeBlock code={multiLineCode} language="shell" showTryIt={true} />);
        expect(require('../TryItButton').TryItButton).toHaveBeenCalledWith(
          expect.objectContaining({
            command: 'echo "hello" && echo "world"',
          }),
          {}
        );
    });
  });

  it('applies className prop to the container', () => {
    const customClass = "my-custom-class";
    const { container } = render(<EnhancedCodeBlock code={mockCode} className={customClass} />);
    // The main div is the first child of the container fragment
    expect(container.firstChild).toHaveClass(customClass);
  });
});
