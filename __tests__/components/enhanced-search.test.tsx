import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EnhancedSearch } from '@/components/search/enhanced-search'
import { useRouter } from 'next/navigation'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

// Mock fetch
global.fetch = jest.fn()

describe('EnhancedSearch Component', () => {
  const mockPush = jest.fn()
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>
  
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    })
    
    // Mock search API response
    mockFetch.mockResolvedValue({
      json: async () => ({
        results: [
          {
            id: 'ls.1',
            name: 'ls',
            section: 1,
            title: 'list directory contents',
            description: 'List information about files',
            category: 'User Commands',
            complexity: 'basic',
            snippet: 'List information about files',
            score: 1.0,
          },
        ],
        total: 1,
        searchTime: 5.2,
      }),
    } as Response)
  })
  
  it('renders search input', () => {
    render(<EnhancedSearch />)
    
    const searchInput = screen.getByPlaceholderText('Search commands...')
    expect(searchInput).toBeInTheDocument()
  })
  
  it('performs search on input', async () => {
    const user = userEvent.setup()
    render(<EnhancedSearch />)
    
    const searchInput = screen.getByPlaceholderText('Search commands...')
    await user.type(searchInput, 'ls')
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/search/enhanced?q=ls')
      )
    })
  })
  
  it('displays search results', async () => {
    const user = userEvent.setup()
    render(<EnhancedSearch />)
    
    const searchInput = screen.getByPlaceholderText('Search commands...')
    await user.type(searchInput, 'ls')
    
    await waitFor(() => {
      expect(screen.getByText('ls')).toBeInTheDocument()
      expect(screen.getByText('List information about files')).toBeInTheDocument()
    })
  })
  
  it('navigates to command on selection', async () => {
    const user = userEvent.setup()
    render(<EnhancedSearch />)
    
    const searchInput = screen.getByPlaceholderText('Search commands...')
    await user.type(searchInput, 'ls')
    
    await waitFor(() => {
      const result = screen.getByText('ls')
      fireEvent.click(result)
    })
    
    expect(mockPush).toHaveBeenCalledWith('/docs/ls.1')
  })
  
  it('handles keyboard navigation', async () => {
    const user = userEvent.setup()
    render(<EnhancedSearch />)
    
    const searchInput = screen.getByPlaceholderText('Search commands...')
    await user.type(searchInput, 'ls')
    
    await waitFor(() => {
      expect(screen.getByText('ls')).toBeInTheDocument()
    })
    
    // Press down arrow
    await user.keyboard('{ArrowDown}')
    
    // Press enter to select
    await user.keyboard('{Enter}')
    
    expect(mockPush).toHaveBeenCalledWith('/docs/ls.1')
  })
  
  it('closes dropdown on escape', async () => {
    const user = userEvent.setup()
    render(<EnhancedSearch />)
    
    const searchInput = screen.getByPlaceholderText('Search commands...')
    await user.type(searchInput, 'ls')
    
    await waitFor(() => {
      expect(screen.getByText('List information about files')).toBeInTheDocument()
    })
    
    await user.keyboard('{Escape}')
    
    await waitFor(() => {
      expect(screen.queryByText('List information about files')).not.toBeInTheDocument()
    })
  })
  
  it('shows loading state', async () => {
    // Mock slow response
    mockFetch.mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 1000))
    )
    
    const user = userEvent.setup()
    render(<EnhancedSearch />)
    
    const searchInput = screen.getByPlaceholderText('Search commands...')
    await user.type(searchInput, 'ls')
    
    // Should show loading spinner
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
  
  it('handles search errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    
    const user = userEvent.setup()
    render(<EnhancedSearch />)
    
    const searchInput = screen.getByPlaceholderText('Search commands...')
    await user.type(searchInput, 'ls')
    
    // Should not crash and input should still be functional
    await waitFor(() => {
      expect(searchInput).toHaveValue('ls')
    })
  })
  
  it('debounces search requests', async () => {
    const user = userEvent.setup()
    render(<EnhancedSearch />)
    
    const searchInput = screen.getByPlaceholderText('Search commands...')
    
    // Type quickly
    await user.type(searchInput, 'test', { delay: 50 })
    
    // Should only make one request after debounce
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('q=test')
      )
    })
  })
  
  it('applies filters', async () => {
    const user = userEvent.setup()
    render(<EnhancedSearch />)
    
    // Open filter menu
    const filterButton = screen.getByRole('button', { name: /filter/i })
    await user.click(filterButton)
    
    // Select a filter
    const sectionFilter = screen.getByText('Section 1')
    await user.click(sectionFilter)
    
    // Type search
    const searchInput = screen.getByPlaceholderText('Search commands...')
    await user.type(searchInput, 'ls')
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('section=1')
      )
    })
  })
})