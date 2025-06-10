import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import LoginForm from '@/components/auth/LoginForm'
import { AuthContext } from '@/contexts/AuthContext'
import * as api from '@/services/api'

vi.mock('@/services/api')

const mockLogin = vi.fn()
const mockAuthContext = {
  user: null,
  login: mockLogin,
  logout: vi.fn(),
  loading: false,
}

describe('LoginForm', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderWithAuth = () => {
    return render(
      <BrowserRouter>
        <AuthContext.Provider value={mockAuthContext}>
          <LoginForm />
        </AuthContext.Provider>
      </BrowserRouter>
    )
  }

  it('renders login form', () => {
    renderWithAuth()

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('validates required fields', async () => {
    renderWithAuth()

    const submitButton = screen.getByRole('button', { name: /sign in/i })
    await user.click(submitButton)

    expect(screen.getByText(/username is required/i)).toBeInTheDocument()
    expect(screen.getByText(/password is required/i)).toBeInTheDocument()
  })

  it('submits login form with valid data', async () => {
    mockLogin.mockResolvedValue({ success: true })

    renderWithAuth()

    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(usernameInput, 'testuser')
    await user.type(passwordInput, 'TestPass123!')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'TestPass123!')
    })
  })

  it('displays error on failed login', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'))

    renderWithAuth()

    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(usernameInput, 'testuser')
    await user.type(passwordInput, 'wrongpass')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
    })
  })

  it('shows loading state during submission', async () => {
    mockLogin.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    )

    renderWithAuth()

    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(usernameInput, 'testuser')
    await user.type(passwordInput, 'TestPass123!')
    await user.click(submitButton)

    expect(screen.getByText(/signing in/i)).toBeInTheDocument()
    expect(submitButton).toBeDisabled()
  })

  it('toggles password visibility', async () => {
    renderWithAuth()

    const passwordInput = screen.getByLabelText(/password/i)
    const toggleButton = screen.getByLabelText(/toggle password visibility/i)

    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(toggleButton)
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.click(toggleButton)
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('handles OAuth login', async () => {
    vi.mocked(api.initiateOAuth).mockResolvedValue({
      auth_url: 'https://github.com/login/oauth/authorize?...',
    })

    renderWithAuth()

    const githubButton = screen.getByRole('button', { name: /sign in with github/i })
    await user.click(githubButton)

    expect(api.initiateOAuth).toHaveBeenCalledWith('github')
  })

  it('shows 2FA input when required', async () => {
    mockLogin.mockRejectedValue({
      response: {
        status: 403,
        data: { detail: '2FA_REQUIRED' },
      },
    })

    renderWithAuth()

    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(usernameInput, 'testuser')
    await user.type(passwordInput, 'TestPass123!')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByLabelText(/2fa code/i)).toBeInTheDocument()
      expect(screen.getByText(/enter your 2fa code/i)).toBeInTheDocument()
    })

    // Submit with 2FA code
    const tfaInput = screen.getByLabelText(/2fa code/i)
    await user.type(tfaInput, '123456')
    
    const verifyButton = screen.getByRole('button', { name: /verify/i })
    await user.click(verifyButton)

    expect(mockLogin).toHaveBeenCalledWith('testuser', 'TestPass123!', '123456')
  })

  it('remembers user preference', async () => {
    renderWithAuth()

    const rememberCheckbox = screen.getByLabelText(/remember me/i)
    expect(rememberCheckbox).not.toBeChecked()

    await user.click(rememberCheckbox)
    expect(rememberCheckbox).toBeChecked()

    // Should pass remember flag to login
    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(usernameInput, 'testuser')
    await user.type(passwordInput, 'TestPass123!')
    await user.click(submitButton)

    expect(mockLogin).toHaveBeenCalledWith(
      'testuser',
      'TestPass123!',
      undefined,
      { remember: true }
    )
  })

  it('redirects after successful login', async () => {
    const mockNavigate = vi.fn()
    vi.mock('react-router-dom', async () => {
      const actual = await vi.importActual('react-router-dom')
      return {
        ...actual,
        useNavigate: () => mockNavigate,
      }
    })

    mockLogin.mockResolvedValue({ success: true })

    renderWithAuth()

    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(usernameInput, 'testuser')
    await user.type(passwordInput, 'TestPass123!')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('validates username format', async () => {
    renderWithAuth()

    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = screen.getByLabelText(/password/i)

    // Invalid username (too short)
    await user.type(usernameInput, 'ab')
    await user.type(passwordInput, 'TestPass123!')
    await user.tab() // Trigger validation

    expect(screen.getByText(/username must be at least 3 characters/i)).toBeInTheDocument()

    // Clear and enter valid username
    await user.clear(usernameInput)
    await user.type(usernameInput, 'validuser')

    expect(screen.queryByText(/username must be at least 3 characters/i)).not.toBeInTheDocument()
  })

  it('handles network errors', async () => {
    mockLogin.mockRejectedValue(new Error('Network error'))

    renderWithAuth()

    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(usernameInput, 'testuser')
    await user.type(passwordInput, 'TestPass123!')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
      expect(screen.getByText(/please check your connection/i)).toBeInTheDocument()
    })
  })
})