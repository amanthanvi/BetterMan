import { render, screen } from '@testing-library/react'
import Home from '@/app/page'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
  usePathname: () => '/',
}))

describe('Home Page', () => {
  it('renders without crashing', () => {
    render(<Home />)
    // Just check that the component renders without throwing
    expect(document.body).toBeTruthy()
  })
})