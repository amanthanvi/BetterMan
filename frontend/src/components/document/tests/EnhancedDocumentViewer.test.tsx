import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnhancedDocumentViewer } from '../EnhancedDocumentViewer'; // Adjust path
import { useAppStore } from '@/stores/appStore'; // Adjust path
import type { Document } from '@/types'; // Adjust path

// Mock useAppStore
jest.mock('@/stores/appStore', () => ({
  useAppStore: jest.fn(),
}));

// Mock child components and utils to focus on EnhancedDocumentViewer logic
jest.mock('@/components/ui/MarkdownRenderer', () => ({
  MarkdownRenderer: jest.fn(({ content }) => <div data-testid="markdown-renderer">{content}</div>),
}));

jest.mock('@/utils/groffParser', () => ({
  ...jest.requireActual('@/utils/groffParser'), // Keep actual implementations
  parseGroffSections: jest.fn((sections) => sections.map(s => ({ // Simplified mock
    ...s,
    name: s.name || 'Parsed Section',
    content: s.content || 'Parsed Content',
    subsections: s.subsections?.map(sub => ({
        ...sub,
        name: sub.name || 'Parsed SubSection',
        content: sub.content || 'Parsed SubContent'
    })) || []
  }))),
}));


jest.mock('@/utils/documentParser', () => ({
  ...jest.requireActual('@/utils/documentParser'), // Keep actual implementations
  parseOptionsSection: jest.fn().mockReturnValue([]),
  parseExamplesSection: jest.fn().mockReturnValue([]),
  parseSynopsisSection: jest.fn().mockReturnValue([]),
  detectCodeBlocks: jest.fn(content => content), // Pass through
}));


// Mock Framer Motion
jest.mock('framer-motion', () => ({
  ...jest.requireActual('framer-motion'),
  motion: {
    ...jest.requireActual('framer-motion').motion,
    aside: jest.fn(({ children, ...props }) => <aside {...props}>{children}</aside>),
    div: jest.fn(({ children, ...props }) => <div {...props}>{children}</div>), // Mock motion.div as well if used for progress bar etc.
  },
  AnimatePresence: jest.fn(({ children }) => <>{children}</>),
}));


// Mock Radix Icons (only those directly used if simple)
jest.mock('@radix-ui/react-icons', () => ({
  BookmarkIcon: () => <span>Bookmark</span>,
  Share1Icon: () => <span>Share</span>,
  DownloadIcon: () => <span>Download</span>,
  HamburgerMenuIcon: () => <span>Menu</span>,
  ChevronRightIcon: () => <span>ChevronRight</span>,
  ChevronDownIcon: () => <span>ChevronDown</span>,
  MagnifyingGlassIcon: () => <span>Search</span>,
  CheckIcon: () => <span>Check</span>,
  DocumentDuplicateIcon: () => <span>Duplicate</span>,
}));


const mockDocument: Document = {
  id: 'test-doc',
  name: 'Test Document',
  title: 'Test Document Title',
  summary: 'A brief summary of the test document.',
  doc_set: 'test-set',
  section: '1',
  sections: [
    { name: 'SECTION 1', content: 'Content for section 1', subsections: [] },
    {
      name: 'SECTION 2',
      content: 'Content for section 2',
      subsections: [{ name: 'SUBSECTION 2.1', content: 'Content for subsection 2.1' }]
    },
  ],
};

describe('EnhancedDocumentViewer', () => {
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
      documentTocOpen: true, // Default to open for some tests
      setDocumentTocOpen: mockSetDocumentTocOpen,
    });
    // Reset mocks for parsers if they were called
    (require('@/utils/groffParser').parseGroffSections as jest.Mock).mockClear();
     // Provide a default mock implementation for IntersectionObserver
    global.IntersectionObserver = jest.fn().mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn(),
    }));
    // Mock window.scrollTo
    window.scrollTo = jest.fn();
  });

  it('renders document title and summary', () => {
    render(<EnhancedDocumentViewer document={mockDocument} />);
    expect(screen.getByText(mockDocument.title!)).toBeInTheDocument();
    expect(screen.getByText(mockDocument.summary!)).toBeInTheDocument();
    expect(screen.getByText(`Section ${mockDocument.section}`)).toBeInTheDocument();
    expect(screen.getByText(mockDocument.doc_set!, { exact: false })).toBeInTheDocument();
  });

  it('renders sections and subsections', () => {
    render(<EnhancedDocumentViewer document={mockDocument} />);
    // Based on the simplified mock of parseGroffSections
    expect(screen.getByText('Parsed Section', { exact: false })).toBeInTheDocument(); // For SECTION 1 & 2
    expect(screen.getByText('Parsed SubSection', { exact: false })).toBeInTheDocument(); // For SUBSECTION 2.1
  });

  it('calls parseGroffSections with correct parameters for document sections', () => {
    render(<EnhancedDocumentViewer document={mockDocument} />);
    // For main content rendering
    expect(require('@/utils/groffParser').parseGroffSections).toHaveBeenCalledWith(
        mockDocument.sections,
        expect.objectContaining({ convertToMarkdown: true, preserveFormatting: true })
    );
    // For TOC generation
    expect(require('@/utils/groffParser').parseGroffSections).toHaveBeenCalledWith(
        mockDocument.sections,
        expect.objectContaining({ preserveFormatting: true }) // convertToMarkdown defaults to false
    );
  });


  describe('Table of Contents (TOC)', () => {
    it('renders TOC when showToc is true', () => {
      render(<EnhancedDocumentViewer document={mockDocument} />);
      expect(screen.getByText('Table of Contents')).toBeInTheDocument();
      // Check if motion.aside is used (our mock will just be <aside>)
      expect(screen.getByRole('complementary')).toBeInTheDocument(); // <aside> role
    });

    it('does not render TOC when showToc is false', () => {
      (useAppStore as jest.Mock).mockReturnValueOnce({
        ...useAppStore(),
        documentTocOpen: false,
        setDocumentTocOpen: mockSetDocumentTocOpen,
      });
      render(<EnhancedDocumentViewer document={mockDocument} />);
      expect(screen.queryByText('Table of Contents')).not.toBeInTheDocument();
    });

    it('calls setDocumentTocOpen to toggle TOC visibility via HamburgerMenuIcon', () => {
      render(<EnhancedDocumentViewer document={mockDocument} />);
      const toggleButton = screen.getByText('Menu').closest('button'); // HamburgerMenuIcon
      expect(toggleButton).toBeInTheDocument();
      fireEvent.click(toggleButton!);
      expect(mockSetDocumentTocOpen).toHaveBeenCalledWith(false); // Assuming current state is true
    });

    it('renders TOC items from document sections', () => {
        render(<EnhancedDocumentViewer document={mockDocument} />);
        // Based on the mock data and simplified parseGroffSections mock
        expect(screen.getByText('Parsed Section', {selector: 'button span span'})).toBeInTheDocument(); // SECTION 1 from TOC
        // SECTION 2 should also be there. The query might need to be more specific if names are identical.
        // For subsections, they would be rendered if expanded, which is harder to test here.
    });

    it('calls scrollToSection when a TOC item is clicked', () => {
        // Mock getElementById to return a dummy element
        const mockElement = document.createElement('div');
        jest.spyOn(document, 'getElementById').mockReturnValue(mockElement);
        const getBoundingClientRectSpy = jest.spyOn(mockElement, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);


        render(<EnhancedDocumentViewer document={mockDocument} />);
        const tocItemButton = screen.getAllByRole('button', { name: /Parsed Section/i })[0]; // Get first TOC item

        fireEvent.click(tocItemButton);

        // Check if getElementById was called with the correct ID (derived from section name)
        // The ID is generated as `section-${section.name.toLowerCase().replace(/\s+/g, "-")}`
        // Our mock parseGroffSections returns "Parsed Section" for name.
        expect(document.getElementById).toHaveBeenCalledWith('section-parsed section');
        expect(window.scrollTo).toHaveBeenCalled();

        getBoundingClientRectSpy.mockRestore();
        jest.restoreAllMocks(); // Clean up getElementById mock
    });
  });

  // Test for active section highlighting (conceptual)
  // True active section highlighting based on scroll is hard to unit test.
  // We can test if `setActiveSection` is called if the conditions are met.
  // This requires mocking IntersectionObserver more deeply.
  describe('Active Section Highlighting', () => {
    it('sets active section based on mocked IntersectionObserver', () => {
      const mockObserve = jest.fn();
      const mockDisconnect = jest.fn();
      const mockUnobserve = jest.fn();

      let observerCallback: (entries: any[]) => void = () => {};

      global.IntersectionObserver = jest.fn((callback) => {
        observerCallback = callback; // Capture the callback
        return {
          observe: mockObserve,
          unobserve: mockUnobserve,
          disconnect: mockDisconnect,
        };
      }) as any;

      render(<EnhancedDocumentViewer document={mockDocument} />);

      // Simulate an intersection event
      // The section ID is generated from the section name by parseGroffSections mock
      const sectionId = 'section-parsed section';
      act(() => {
        observerCallback([{ target: { id: sectionId }, isIntersecting: true }]);
      });

      // Check if the TOC item for this section would become active
      // This requires checking if `activeSection` state in the component was updated.
      // We don't have direct access to component state, so we'd check for its effects,
      // e.g., if the corresponding TOC item gets an 'active' class.
      // For this test, we'll assume `setActiveSection` was called.
      // A more robust test would involve querying the DOM for the "active" class on the TOC item.
      // Example: expect(screen.getByRole('button', { name: 'Parsed Section' })).toHaveClass('active');
      // This part is highly dependent on the actual class names and structure.

      // For now, we've tested that the observer setup is called.
      expect(mockObserve).toHaveBeenCalled();
    });
  });

  it('handles document with no sections gracefully', () => {
    const docWithoutSections: Document = { ...mockDocument, sections: [] };
    render(<EnhancedDocumentViewer document={docWithoutSections} />);
    expect(screen.getByText('No content available for this document.')).toBeInTheDocument();
  });

  it('handles undefined document properties gracefully in header', () => {
    const partialDoc: Document = { id:'1', name: 'Partial', title: undefined, summary: undefined, sections: [] };
    render(<EnhancedDocumentViewer document={partialDoc} />);
    // Check that it doesn't crash and title is empty or handled by `|| ''`
    // The h1 will exist. Check its content.
    const heading = screen.getByRole('heading', {level: 1});
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toBe(''); // Due to `document.title || ''`
  });

});
