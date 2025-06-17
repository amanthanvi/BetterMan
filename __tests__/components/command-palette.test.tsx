import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPalette } from '@/components/command-palette/command-palette'
import { useRouter } from 'next/navigation'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

// Mock cmdk
jest.mock('cmdk', () => ({
  Command: ({ children, onKeyDown }: any) => (
    <div data-testid="command" onKeyDown={onKeyDown}>{children}</div>
  ),
  CommandDialog: ({ children, open }: any) => (
    open ? <div role="dialog">{children}</div> : null
  ),
  CommandInput: (props: any) => <input {...props} />,
  CommandList: ({ children }: any) => <div>{children}</div>,
  CommandEmpty: ({ children }: any) => <div>{children}</div>,
  CommandGroup: ({ heading, children }: any) => (
    <div>
      <h3>{heading}</h3>
      {children}
    </div>
  ),
  CommandItem: ({ children, onSelect }: any) => (
    <div onClick={onSelect} role="option">{children}</div>
  ),
  CommandSeparator: () => <hr />,
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

describe('CommandPalette', () => {
  const mockPush = jest.fn()
  
  beforeEach(() => {
    jest.clearAllMocks()
    localStorageMock.clear()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    })
  })

  it('opens with keyboard shortcut', async () => {
    render(<CommandPalette />)
    
    // Should not be visible initially
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    
    // Press Cmd+K
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    
    // Should be visible
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('closes with Escape key', async () => {
    render(<CommandPalette />)
    
    // Open palette
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    
    // Press Escape
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    
    // Should close
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('searches commands', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)
    
    // Open palette
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    
    // Type in search
    const input = screen.getByPlaceholderText('Type a command or search...')
    await user.type(input, 'search')
    
    // Should show search-related commands
    expect(screen.getByText('Search documentation')).toBeInTheDocument()
  })

  it('navigates to command documentation', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)
    
    // Open palette
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    
    // Search for a command
    const input = screen.getByPlaceholderText('Type a command or search...')
    await user.type(input, 'ls')
    
    // Should show ls command
    const lsOption = screen.getByText('Go to ls documentation')
    await user.click(lsOption)
    
    // Should navigate
    expect(mockPush).toHaveBeenCalledWith('/docs/ls.1')
  })

  it('shows recent commands', async () => {
    // Set up recent commands
    localStorageMock.setItem('recentCommands', JSON.stringify([
      { id: 'ls.1', name: 'ls', timestamp: Date.now() },
    ]))
    
    render(<CommandPalette />)
    
    // Open palette
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    
    // Should show recent commands
    expect(screen.getByText('Recent')).toBeInTheDocument()
    expect(screen.getByText('ls')).toBeInTheDocument()
  })

  it('shows favorite commands', async () => {
    // Set up favorites
    localStorageMock.setItem('favoriteCommands', JSON.stringify(['grep.1']))
    
    render(<CommandPalette />)
    
    // Open palette
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    
    // Should show favorites
    expect(screen.getByText('Favorites')).toBeInTheDocument()
  })

  it('executes theme toggle action', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)
    
    // Open palette
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    
    // Search for theme
    const input = screen.getByPlaceholderText('Type a command or search...')
    await user.type(input, 'theme')
    
    // Should show theme action
    const themeOption = screen.getByText(/Toggle theme/i)
    expect(themeOption).toBeInTheDocument()
  })

  it('handles empty search results', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)
    
    // Open palette
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    
    // Type nonsense
    const input = screen.getByPlaceholderText('Type a command or search...')
    await user.type(input, 'xyzabc123')
    
    // Should show empty state
    expect(screen.getByText('No results found.')).toBeInTheDocument()
  })

  it('supports keyboard navigation', async () => {
    render(<CommandPalette />)
    
    // Open palette
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    
    const dialog = screen.getByRole('dialog')
    
    // Press down arrow
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    
    // Press enter to select
    fireEvent.keyDown(dialog, { key: 'Enter' })
    
    // Should have executed action
    expect(mockPush).toHaveBeenCalled()
  })

  it('clears search on close', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)
    
    // Open palette
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    
    // Type search
    const input = screen.getByPlaceholderText('Type a command or search...')
    await user.type(input, 'test')
    expect(input).toHaveValue('test')
    
    // Close palette
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    
    // Open again
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    
    // Search should be cleared
    const newInput = screen.getByPlaceholderText('Type a command or search...')
    expect(newInput).toHaveValue('')
  })
})