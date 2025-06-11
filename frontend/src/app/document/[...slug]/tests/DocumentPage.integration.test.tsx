import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
// Assuming DocumentPage is the default export from a file within app/document/[...slug]
// The exact import path will depend on your actual file structure.
// For this example, let's assume it's adjacent or in a specific component file.
// import DocumentPage from '../page'; // Or appropriate path to your Page component

import { EnhancedDocumentViewer } from '@/components/document/EnhancedDocumentViewer'; // Import the actual component
import { useAppStore } from '@/stores/appStore';
import type { Document } from '@/types';

// Mocks
jest.mock('@/stores/appStore', () => ({
  useAppStore: jest.fn(),
}));

// Mock EnhancedDocumentViewer if DocumentPage is a thin wrapper.
// If DocumentPage HAS a lot of its own logic and USES EnhancedDocumentViewer,
// then we might not mock EnhancedDocumentViewer for an integration test,
// or only mock parts of its internals.
// For this example, let's assume DocumentPage directly uses EnhancedDocumentViewer
// and we want to test that integration.

// Mock next/navigation if used by DocumentPage
jest.mock('next/navigation', () => ({
  useParams: () => ({ slug: ['test-doc', '1'] }),
  useRouter: () => ({ push: jest.fn() }),
  // Add other hooks if used
}));

// A more complete DocumentPage might fetch data.
// For this test, we'll assume data is passed as a prop or fetched by a mockable hook.
// Let's assume DocumentPage fetches data and then renders EnhancedDocumentViewer.
// For simplicity, we'll directly render EnhancedDocumentViewer as if DocumentPage prepared the data.

const mockDocumentData: Document = {
  id: 'test-doc-integration',
  name: 'Integration Test Doc',
  title: 'Integration Test Document Title',
  summary: 'Summary for integration test.',
  doc_set: 'integration-set',
  section: '1',
  sections: [
    { name: 'Intro Section', content: 'This is the intro. It has some `inline_code`.', subsections: [] },
    {
      name: 'Code Examples',
      content: 'Example of a command:\n```bash\nls -l /home\necho "done"\n```',
      subsections: [{ name: 'Detail SubSection', content: 'More details here.' }]
    },
    { name: 'Another Section', content: 'Text for another section.'}
  ],
};

// Mock for fetch or data fetching hook if DocumentPage uses one
// global.fetch = jest.fn(() =>
//   Promise.resolve({
//     json: () => Promise.resolve(mockDocumentData),
//     ok: true,
//   })
// ) as jest.Mock;


describe('DocumentPage Integration Test (simulated via EnhancedDocumentViewer)', () => {
  let mockSetDocumentTocOpen: jest.Mock;

  beforeEach(() => {
    mockSetDocumentTocOpen = jest.fn();
    (useAppStore as jest.Mock).mockReturnValue({
      darkMode: false,
      isFavorite: jest.fn().mockReturnValue(false),
      addFavorite: jest.fn(),
      removeFavorite: jest.fn(),
      addRecentDoc: jest.fn(),
      addToast: jest.fn(),
      documentTocOpen: false, // Start with TOC closed for some tests
      setDocumentTocOpen: mockSetDocumentTocOpen,
    });

    // Mock IntersectionObserver for EnhancedDocumentViewer
    global.IntersectionObserver = jest.fn().mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn(),
    }));
    window.scrollTo = jest.fn();
    document.getElementById = jest.fn(id => {
        const el = document.createElement('div');
        el.id = id;
        // Mock getBoundingClientRect for elements that might be scrolled to
        el.getBoundingClientRect = jest.fn().mockReturnValue({
            top: 100, // arbitrary value
            left: 0,
            bottom: 200,
            right: 100,
            width: 100,
            height: 100,
            x: 0,
            y: 100,
            toJSON: () => ({})
        });
        return el;
    });
  });

  // If DocumentPage itself was being rendered:
  // render(<DocumentPage params={{ slug: ['test-doc', '1'] }} />);
  // For now, directly testing EnhancedDocumentViewer as the core UI

  it('renders the document title and sections', async () => {
    render(<EnhancedDocumentViewer document={mockDocumentData} />);

    // Wait for content to be processed and rendered if there are async operations
    // (not strictly necessary with current mocks, but good practice)
    await waitFor(() => {
      expect(screen.getByText('Integration Test Document Title')).toBeInTheDocument();
    });
    expect(screen.getByText('Intro Section', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText('This is the intro. It has some ', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('inline_code')).toBeInTheDocument(); // Check for inline code

    expect(screen.getByText('Code Examples', { selector: 'h2' })).toBeInTheDocument();
    // Check for code block content (EnhancedCodeBlock is mocked in other tests, here it's part of integration)
    // This text will be inside the EnhancedCodeBlock -> SyntaxHighlighter
    expect(screen.getByText((content, element) => element?.tagName.toLowerCase() === 'code' && content.startsWith('ls -l /home'))).toBeInTheDocument();
  });

  describe('TOC Interactions', () => {
    it('opens and closes the TOC', () => {
      render(<EnhancedDocumentViewer document={mockDocumentData} />);

      // TOC should be initially closed based on mock
      expect(screen.queryByText('Table of Contents')).not.toBeInTheDocument();

      // Find the button that opens the TOC (HamburgerMenuIcon)
      const openTocButton = screen.getByRole('button', { name: /Menu/i }); // Name from icon mock
      fireEvent.click(openTocButton);
      expect(mockSetDocumentTocOpen).toHaveBeenCalledWith(true);

      // Assume store updates and re-renders (simulate by changing mock and re-rendering or using waitFor)
      (useAppStore as jest.Mock).mockReturnValueOnce({
        ...useAppStore(),
        documentTocOpen: true,
        setDocumentTocOpen: mockSetDocumentTocOpen,
      });
      render(<EnhancedDocumentViewer document={mockDocumentData} />) // Re-render with new store state

      expect(screen.getByText('Table of Contents')).toBeInTheDocument();
      expect(screen.getByText('Intro Section', { selector: 'button span span' })).toBeInTheDocument(); // TOC item
    });

    it('TOC link click calls scrollToSection (simulated)', () => {
      // Start with TOC open
      (useAppStore as jest.Mock).mockReturnValueOnce({
        ...useAppStore(),
        documentTocOpen: true,
        setDocumentTocOpen: mockSetDocumentTocOpen,
      });
      render(<EnhancedDocumentViewer document={mockDocumentData} />);

      const tocLink = screen.getByRole('button', { name: /Intro Section/i });
      fireEvent.click(tocLink);

      // Verify that getElementById and scrollTo were called (as in EnhancedDocumentViewer unit test)
      expect(document.getElementById).toHaveBeenCalledWith('section-intro section'); // ID from section name
      expect(window.scrollTo).toHaveBeenCalled();
    });
  });

  it('displays code blocks with copy button', async () => {
    render(<EnhancedDocumentViewer document={mockDocumentData} />);

    // Find the code block (specifically the one from "Code Examples" section)
    const codeBlockText = 'ls -l /home\necho "done"';
    // The text might be split across elements by the highlighter.
    // A more robust way is to find the container EnhancedCodeBlock renders.
    // For now, let's assume we can find part of the text.
    await screen.findByText((content, el) => el?.tagName.toLowerCase() === 'code' && content.includes('ls -l /home'));

    // EnhancedCodeBlock will render a copy button.
    // It's usually visible on hover, but for testing, it should be in the DOM.
    const copyButton = screen.getAllByRole('button', { name: /Copy/i })[0]; // Get the first one
    expect(copyButton).toBeInTheDocument();

    // Mock clipboard for this interaction test within integration scope
    const clipboardWriteTextSpy = jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValueOnce(undefined);
    fireEvent.click(copyButton);
    expect(clipboardWriteTextSpy).toHaveBeenCalledWith(codeBlockText);
    expect(await screen.findByText(/Copied/i)).toBeInTheDocument();
    clipboardWriteTextSpy.mockRestore();
  });

  // Add more tests as needed:
  // - Dark mode behavior (if DocumentPage controls it or passes it down)
  // - Font size changes
  // - Favorite button interaction
  // - Share, Print button interactions (mocking navigator APIs)
});
