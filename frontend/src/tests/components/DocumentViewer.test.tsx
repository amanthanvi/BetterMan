import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import DocumentViewer from '@/components/document/DocumentViewer'
import * as api from '@/services/api'
import { useAppStore } from '@/stores/appStore'

vi.mock('@/services/api')

const mockDocument = {
  id: 1,
  command: 'ls',
  section: 1,
  description: 'list directory contents',
  content: `NAME
       ls - list directory contents

SYNOPSIS
       ls [OPTION]... [FILE]...

DESCRIPTION
       List information about the FILEs.`,
  html_content: '<h1>ls</h1><p>list directory contents</p>',
  tldr: 'List files and directories',
  examples: [
    { description: 'List all files', command: 'ls -la' },
    { description: 'List with human readable sizes', command: 'ls -lh' },
  ],
  related_commands: ['dir', 'vdir', 'tree'],
  tags: ['files', 'directories'],
}

describe('DocumentViewer', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({ favorites: [] })
  })

  const renderWithRouter = (command: string = 'ls') => {
    return render(
      <BrowserRouter>
        <Routes>
          <Route path="/docs/:command" element={<DocumentViewer />} />
        </Routes>
      </BrowserRouter>,
      {
        initialEntries: [`/docs/${command}`],
      }
    )
  }

  it('loads and displays document', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(mockDocument)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('ls - list directory contents')).toBeInTheDocument()
      expect(screen.getByText('List files and directories')).toBeInTheDocument()
    })
  })

  it('shows loading state while fetching', async () => {
    vi.mocked(api.getDocument).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    )

    renderWithRouter()

    expect(screen.getByTestId('document-skeleton')).toBeInTheDocument()
  })

  it('handles document not found', async () => {
    vi.mocked(api.getDocument).mockRejectedValue(
      new Error('Document not found')
    )

    renderWithRouter('nonexistent')

    await waitFor(() => {
      expect(screen.getByText(/document not found/i)).toBeInTheDocument()
    })
  })

  it('renders examples section', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(mockDocument)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Examples')).toBeInTheDocument()
      expect(screen.getByText('List all files')).toBeInTheDocument()
      expect(screen.getByText('ls -la')).toBeInTheDocument()
    })
  })

  it('renders related commands', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(mockDocument)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Related Commands')).toBeInTheDocument()
      expect(screen.getByText('dir')).toBeInTheDocument()
      expect(screen.getByText('tree')).toBeInTheDocument()
    })
  })

  it('toggles favorite status', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(mockDocument)
    vi.mocked(api.addFavorite).mockResolvedValue({ success: true })
    vi.mocked(api.removeFavorite).mockResolvedValue({ success: true })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByLabelText('Add to favorites')).toBeInTheDocument()
    })

    const favoriteButton = screen.getByLabelText('Add to favorites')
    await user.click(favoriteButton)

    await waitFor(() => {
      expect(api.addFavorite).toHaveBeenCalledWith(1)
      expect(screen.getByLabelText('Remove from favorites')).toBeInTheDocument()
    })

    await user.click(favoriteButton)

    await waitFor(() => {
      expect(api.removeFavorite).toHaveBeenCalledWith(1)
      expect(screen.getByLabelText('Add to favorites')).toBeInTheDocument()
    })
  })

  it('copies command to clipboard', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(mockDocument)
    
    const mockWriteText = vi.fn()
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('ls -la')).toBeInTheDocument()
    })

    const copyButton = screen.getAllByLabelText('Copy command')[0]
    await user.click(copyButton)

    expect(mockWriteText).toHaveBeenCalledWith('ls -la')
    expect(screen.getByText('Copied!')).toBeInTheDocument()
  })

  it('opens terminal with command', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(mockDocument)
    vi.mocked(api.createTerminalSession).mockResolvedValue({
      session_id: 'test-session',
      websocket_url: 'ws://localhost/terminal',
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('ls -la')).toBeInTheDocument()
    })

    const tryButton = screen.getAllByText('Try it')[0]
    await user.click(tryButton)

    expect(api.createTerminalSession).toHaveBeenCalledWith('ls -la')
  })

  it('switches between content views', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(mockDocument)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Formatted')).toBeInTheDocument()
    })

    // Switch to raw view
    const rawButton = screen.getByText('Raw')
    await user.click(rawButton)

    expect(screen.getByText(/NAME.*ls - list directory contents/s)).toBeInTheDocument()

    // Switch back to formatted
    const formattedButton = screen.getByText('Formatted')
    await user.click(formattedButton)

    expect(screen.getByRole('heading', { name: 'ls' })).toBeInTheDocument()
  })

  it('handles keyboard shortcuts', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(mockDocument)
    const mockWriteText = vi.fn()
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('ls - list directory contents')).toBeInTheDocument()
    })

    // Test copy shortcut (Cmd/Ctrl + C)
    await user.keyboard('{Control>}c{/Control}')
    expect(mockWriteText).toHaveBeenCalled()

    // Test favorite shortcut (Cmd/Ctrl + D)
    await user.keyboard('{Control>}d{/Control}')
    expect(api.addFavorite).toHaveBeenCalled()
  })

  it('tracks scroll progress', async () => {
    vi.mocked(api.getDocument).mockResolvedValue({
      ...mockDocument,
      content: 'Very long content\n'.repeat(1000),
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByTestId('scroll-progress')).toBeInTheDocument()
    })

    const progressBar = screen.getByTestId('scroll-progress')
    expect(progressBar).toHaveStyle({ width: '0%' })

    // Simulate scroll
    const viewer = screen.getByTestId('document-viewer')
    fireEvent.scroll(viewer, { target: { scrollTop: 500, scrollHeight: 1000 } })

    expect(progressBar).toHaveStyle({ width: '50%' })
  })

  it('shows table of contents for long documents', async () => {
    vi.mocked(api.getDocument).mockResolvedValue({
      ...mockDocument,
      html_content: `
        <h1>ls</h1>
        <h2 id="synopsis">Synopsis</h2>
        <h2 id="description">Description</h2>
        <h2 id="options">Options</h2>
        <h2 id="examples">Examples</h2>
      `,
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Table of Contents')).toBeInTheDocument()
      expect(screen.getByText('Synopsis')).toBeInTheDocument()
      expect(screen.getByText('Options')).toBeInTheDocument()
    })

    // Click TOC item
    const optionsLink = screen.getByRole('link', { name: 'Options' })
    await user.click(optionsLink)

    // Should scroll to section
    expect(window.location.hash).toBe('#options')
  })

  it('supports print view', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(mockDocument)
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByLabelText('Print document')).toBeInTheDocument()
    })

    const printButton = screen.getByLabelText('Print document')
    await user.click(printButton)

    expect(printSpy).toHaveBeenCalled()
    expect(document.body).toHaveClass('print-mode')
  })

  it('handles share functionality', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(mockDocument)
    const mockShare = vi.fn()
    Object.assign(navigator, { share: mockShare })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByLabelText('Share document')).toBeInTheDocument()
    })

    const shareButton = screen.getByLabelText('Share document')
    await user.click(shareButton)

    expect(mockShare).toHaveBeenCalledWith({
      title: 'ls - list directory contents',
      text: 'Check out the ls command documentation',
      url: expect.stringContaining('/docs/ls'),
    })
  })
})