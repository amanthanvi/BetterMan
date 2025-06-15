import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

// Mock stores
const createMockAppStore = () => ({
  // State
  theme: 'light',
  searchHistory: [],
  recentDocuments: [],
  favorites: [],
  preferences: {
    fontSize: 'medium',
    lineHeight: 'normal',
    showLineNumbers: true,
    syntaxHighlighting: true,
    autoSave: true,
  },
  isOffline: false,
  commandPaletteOpen: false,
  
  // Actions
  toggleTheme: jest.fn(),
  addSearchHistory: jest.fn(),
  addRecentDocument: jest.fn(),
  toggleFavorite: jest.fn(),
  updatePreferences: jest.fn(),
  setOffline: jest.fn(),
  setCommandPaletteOpen: jest.fn(),
});

const createMockAuthStore = () => ({
  // State
  isAuthenticated: false,
  user: null,
  token: null,
  loading: false,
  error: null,
  
  // Actions
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
  refreshToken: jest.fn(),
  setUser: jest.fn(),
});

// Mock providers
interface TestProviderProps {
  children: React.ReactNode;
  initialRoute?: string;
}

const TestProviders: React.FC<TestProviderProps> = ({ 
  children, 
  initialRoute = '/' 
}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
      },
    },
  });

  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });

  // Set initial route
  window.history.pushState({}, 'Test page', initialRoute);

  return (
    <QueryClientProvider client={queryClient}
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

// Custom render function
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { initialRoute?: string }
) => {
  const { initialRoute, ...renderOptions } = options || {};
  
  return {
    user: userEvent.setup(),
    ...render(ui, {
      wrapper: ({ children }) => (
        <TestProviders initialRoute={initialRoute}
          {children}
        </TestProviders>
      ),
      ...renderOptions,
    }),
  };
};

// Mock API responses
export const mockApiResponses = {
  searchResults: {
    query: 'test',
    results: [
      {
        id: '1',
        name: 'test-command',
        title: 'Test Command',
        section: '1',
        summary: 'A test command for testing',
        score: 0.95,
      },
    ],
    total: 1,
    took: 10,
  },
  
  document: {
    id: '1',
    name: 'test-command',
    title: 'Test Command',
    section: '1',
    content: '# Test Command\n\nThis is a test command.',
    summary: 'A test command for testing',
    category: 'utilities',
    lastUpdated: new Date().toISOString(),
  },
  
  user: {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    createdAt: new Date().toISOString(),
  },
};

// Test data generators
export const generateDocument = (overrides = {}) => ({
  id: Math.random().toString(36).substr(2, 9),
  name: 'test-doc',
  title: 'Test Document',
  section: '1',
  summary: 'A test document',
  category: 'general',
  content: '# Test Document\n\nTest content',
  lastUpdated: new Date().toISOString(),
  ...overrides,
});

export const generateSearchResult = (overrides = {}) => ({
  id: Math.random().toString(36).substr(2, 9),
  name: 'test-result',
  title: 'Test Result',
  section: '1',
  summary: 'A test search result',
  score: 0.9,
  match_type: 'exact',
  ...overrides,
});

// Utility functions
export const waitForLoadingToFinish = () => {
  return new Promise(resolve => setTimeout(resolve, 0));
};

// Re-export everything from testing library
export * from '@testing-library/react';
export { customRender as render, createMockAppStore, createMockAuthStore };

// Export userEvent
export { userEvent };