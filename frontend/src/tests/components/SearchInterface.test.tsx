import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import SearchInterface from '@/components/search/SearchInterface'
import * as api from '@/services/api'

// Mock the API module
vi.mock('@/services/api')

const mockSearchResults = [
  {
    id: 1,
    command: 'ls',
    section: 1,
    description: 'list directory contents',
    score: 0.95,
  },
  {
    id: 2,
    command: 'lsof',
    section: 8,
    description: 'list open files',
    score: 0.85,
  },
]

describe('SearchInterface', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders search input', () => {
    render(
      <BrowserRouter>
        <SearchInterface />
      </BrowserRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search for commands/i)
    expect(searchInput).toBeInTheDocument()
  })

  it('performs search on input', async () => {
    vi.mocked(api.searchDocuments).mockResolvedValue({
      results: mockSearchResults,
      total: 2,
    })

    render(
      <BrowserRouter>
        <SearchInterface />
      </BrowserRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search for commands/i)
    await user.type(searchInput, 'ls')

    await waitFor(() => {
      expect(api.searchDocuments).toHaveBeenCalledWith('ls', expect.any(Object))
    })
  })

  it('displays search results', async () => {
    vi.mocked(api.searchDocuments).mockResolvedValue({
      results: mockSearchResults,
      total: 2,
    })

    render(
      <BrowserRouter>
        <SearchInterface />
      </BrowserRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search for commands/i)
    await user.type(searchInput, 'ls')

    await waitFor(() => {
      expect(screen.getByText('list directory contents')).toBeInTheDocument()
      expect(screen.getByText('list open files')).toBeInTheDocument()
    })
  })

  it('shows loading state during search', async () => {
    vi.mocked(api.searchDocuments).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    )

    render(
      <BrowserRouter>
        <SearchInterface />
      </BrowserRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search for commands/i)
    await user.type(searchInput, 'test')

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('handles search errors gracefully', async () => {
    vi.mocked(api.searchDocuments).mockRejectedValue(new Error('Search failed'))

    render(
      <BrowserRouter>
        <SearchInterface />
      </BrowserRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search for commands/i)
    await user.type(searchInput, 'error')

    await waitFor(() => {
      expect(screen.getByText(/error occurred/i)).toBeInTheDocument()
    })
  })

  it('debounces search input', async () => {
    vi.mocked(api.searchDocuments).mockResolvedValue({
      results: [],
      total: 0,
    })

    render(
      <BrowserRouter>
        <SearchInterface />
      </BrowserRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search for commands/i)
    
    // Type quickly
    await user.type(searchInput, 'test')
    
    // API should only be called once after debounce
    await waitFor(() => {
      expect(api.searchDocuments).toHaveBeenCalledTimes(1)
    })
  })

  it('clears search results when input is cleared', async () => {
    vi.mocked(api.searchDocuments).mockResolvedValue({
      results: mockSearchResults,
      total: 2,
    })

    render(
      <BrowserRouter>
        <SearchInterface />
      </BrowserRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search for commands/i)
    await user.type(searchInput, 'ls')

    await waitFor(() => {
      expect(screen.getByText('list directory contents')).toBeInTheDocument()
    })

    await user.clear(searchInput)

    await waitFor(() => {
      expect(screen.queryByText('list directory contents')).not.toBeInTheDocument()
    })
  })

  it('handles keyboard navigation', async () => {
    vi.mocked(api.searchDocuments).mockResolvedValue({
      results: mockSearchResults,
      total: 2,
    })

    render(
      <BrowserRouter>
        <SearchInterface />
      </BrowserRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search for commands/i)
    await user.type(searchInput, 'ls')

    await waitFor(() => {
      expect(screen.getByText('list directory contents')).toBeInTheDocument()
    })

    // Navigate with arrow keys
    await user.keyboard('{ArrowDown}')
    expect(screen.getByTestId('result-0')).toHaveClass('highlighted')

    await user.keyboard('{ArrowDown}')
    expect(screen.getByTestId('result-1')).toHaveClass('highlighted')

    // Select with Enter
    await user.keyboard('{Enter}')
    expect(window.location.pathname).toBe('/docs/lsof')
  })

  it('supports instant search mode', async () => {
    const mockInstantResults = [
      { id: 1, command: 'git', section: 1 },
      { id: 2, command: 'github', section: 1 },
    ]

    vi.mocked(api.instantSearch).mockResolvedValue({
      results: mockInstantResults,
    })

    render(
      <BrowserRouter>
        <SearchInterface instantMode />
      </BrowserRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search for commands/i)
    await user.type(searchInput, 'gi')

    await waitFor(() => {
      expect(api.instantSearch).toHaveBeenCalledWith('gi')
      expect(screen.getByText('git')).toBeInTheDocument()
    })
  })

  it('filters results by section', async () => {
    vi.mocked(api.searchDocuments).mockResolvedValue({
      results: mockSearchResults,
      total: 2,
    })

    render(
      <BrowserRouter>
        <SearchInterface />
      </BrowserRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search for commands/i)
    await user.type(searchInput, 'ls')

    await waitFor(() => {
      expect(screen.getByText('list directory contents')).toBeInTheDocument()
    })

    // Click section filter
    const section1Filter = screen.getByLabelText('Section 1')
    await user.click(section1Filter)

    await waitFor(() => {
      expect(api.searchDocuments).toHaveBeenCalledWith('ls', { section: 1 })
    })
  })
})