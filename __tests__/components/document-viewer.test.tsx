import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EnhancedDocumentViewer } from '@/components/docs/enhanced-document-viewer'
import type { EnhancedManPage } from '@/lib/parser/enhanced-man-parser'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
  },
  AnimatePresence: ({ children }: any) => children,
}))

describe('EnhancedDocumentViewer', () => {
  const mockPage: EnhancedManPage = {
    name: 'ls',
    section: 1,
    title: 'list directory contents',
    description: 'List information about the FILEs',
    synopsis: 'ls [OPTION]... [FILE]...',
    flags: [
      {
        flag: '-a',
        longFlag: '--all',
        description: 'do not ignore entries starting with .',
        category: 'Display Options',
      },
      {
        flag: '-l',
        description: 'use a long listing format',
        category: 'Display Options',
      },
    ],
    examples: [
      {
        command: 'ls -la',
        description: 'List all files in long format',
        category: 'Basic Usage',
      },
      {
        command: 'ls -lh /var/log',
        description: 'List files with human-readable sizes',
        category: 'Advanced Usage',
      },
    ],
    sections: [
      {
        title: 'Description',
        content: 'List information about the FILEs (the current directory by default).',
      },
    ],
    relatedCommands: ['dir', 'vdir', 'tree'],
    complexity: 'basic',
    metadata: {
      author: 'Richard M. Stallman',
      lastUpdated: '2024-01-01',
      version: '9.0',
    },
  }

  it('renders man page content', () => {
    render(<EnhancedDocumentViewer page={mockPage} />)
    
    expect(screen.getByText('ls')).toBeInTheDocument()
    expect(screen.getByText('list directory contents')).toBeInTheDocument()
    expect(screen.getByText('List information about the FILEs')).toBeInTheDocument()
  })

  it('renders synopsis section', () => {
    render(<EnhancedDocumentViewer page={mockPage} />)
    
    expect(screen.getByText('Synopsis')).toBeInTheDocument()
    expect(screen.getByText('ls [OPTION]... [FILE]...')).toBeInTheDocument()
  })

  it('renders flags section', () => {
    render(<EnhancedDocumentViewer page={mockPage} />)
    
    expect(screen.getByText('Options')).toBeInTheDocument()
    expect(screen.getByText('-a')).toBeInTheDocument()
    expect(screen.getByText('--all')).toBeInTheDocument()
    expect(screen.getByText('do not ignore entries starting with .')).toBeInTheDocument()
  })

  it('renders examples section', () => {
    render(<EnhancedDocumentViewer page={mockPage} />)
    
    expect(screen.getByText('Examples')).toBeInTheDocument()
    expect(screen.getByText('ls -la')).toBeInTheDocument()
    expect(screen.getByText('List all files in long format')).toBeInTheDocument()
  })

  it('handles collapsible sections', async () => {
    const user = userEvent.setup()
    render(<EnhancedDocumentViewer page={mockPage} />)
    
    // Find collapsible section
    const descriptionButton = screen.getByRole('button', { name: /Description/i })
    
    // Should be expanded by default
    expect(screen.getByText(/List information about the FILEs \(the current directory by default\)/)).toBeInTheDocument()
    
    // Click to collapse
    await user.click(descriptionButton)
    
    // Content should be hidden
    await waitFor(() => {
      expect(screen.queryByText(/List information about the FILEs \(the current directory by default\)/)).not.toBeInTheDocument()
    })
  })

  it('copies code on click', async () => {
    const user = userEvent.setup()
    
    // Mock clipboard API
    const writeText = jest.fn()
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    })
    
    render(<EnhancedDocumentViewer page={mockPage} />)
    
    // Find code block
    const codeBlock = screen.getByText('ls -la')
    
    // Click to copy
    await user.click(codeBlock)
    
    expect(writeText).toHaveBeenCalledWith('ls -la')
  })

  it('highlights search terms', () => {
    render(<EnhancedDocumentViewer page={mockPage} searchQuery="list" />)
    
    // Should highlight "list" in title
    const highlighted = screen.getAllByText(/list/i)
    expect(highlighted.length).toBeGreaterThan(0)
  })

  it('renders metadata', () => {
    render(<EnhancedDocumentViewer page={mockPage} />)
    
    expect(screen.getByText(/Version: 9.0/)).toBeInTheDocument()
    expect(screen.getByText(/Author: Richard M. Stallman/)).toBeInTheDocument()
  })

  it('renders related commands', () => {
    render(<EnhancedDocumentViewer page={mockPage} />)
    
    expect(screen.getByText('See Also')).toBeInTheDocument()
    expect(screen.getByText('dir')).toBeInTheDocument()
    expect(screen.getByText('vdir')).toBeInTheDocument()
    expect(screen.getByText('tree')).toBeInTheDocument()
  })

  it('filters flags by category', async () => {
    const user = userEvent.setup()
    render(<EnhancedDocumentViewer page={mockPage} />)
    
    // Should show all flags initially
    expect(screen.getByText('-a')).toBeInTheDocument()
    expect(screen.getByText('-l')).toBeInTheDocument()
    
    // Open filter dropdown
    const filterButton = screen.getByRole('button', { name: /Filter/i })
    await user.click(filterButton)
    
    // Select a category
    const categoryOption = screen.getByText('Display Options')
    await user.click(categoryOption)
    
    // Should still show both flags (they're in the same category)
    expect(screen.getByText('-a')).toBeInTheDocument()
    expect(screen.getByText('-l')).toBeInTheDocument()
  })

  it('handles missing optional fields gracefully', () => {
    const minimalPage: EnhancedManPage = {
      name: 'test',
      section: 1,
      title: 'test command',
      description: 'A test command',
      synopsis: 'test',
      flags: [],
      examples: [],
      sections: [],
      relatedCommands: [],
      complexity: 'basic',
      metadata: {},
    }
    
    render(<EnhancedDocumentViewer page={minimalPage} />)
    
    expect(screen.getByText('test')).toBeInTheDocument()
    expect(screen.getByText('test command')).toBeInTheDocument()
  })
})