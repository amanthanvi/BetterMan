// Core document types
export interface Document {
  id: string;
  name?: string; // Command name (e.g., "ls", "grep")
  title: string;
  summary: string;
  section: string | number;
  score: number;
  doc_set: string;
  content?: string;
  raw_content?: string;
  sections?: Array<{
    name: string;
    content: string;
    subsections?: Array<{
      name: string;
      content: string;
    };
  };
  related?: string[];
  matches?: string[];
  last_updated?: string;
  tags?: string[];
  access_count?: number;
}

// Search types
export interface SearchResult {
  results: Document[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
  query: string;
  took_ms?: number;
}

export interface SearchFilters {
  section?: number[];
  doc_set?: string[];
  tags?: string[];
  date_range?: {
    from?: string;
    to?: string;
  };
}

export interface SearchState {
  query: string;
  results: Document[];
  loading: boolean;
  error: string | null;
  filters: SearchFilters;
  suggestions: string[];
  history: string[];
  recent: Document[];
}

// User preferences
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  fontFamily: 'system' | 'mono' | 'serif';
  compactMode: boolean;
  showLineNumbers: boolean;
  enableKeyboardShortcuts: boolean;
  language: string;
}

// Toast notification
export interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
}

// Application state
export interface AppState {
  darkMode: boolean;
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  preferences: UserPreferences;
  favorites: string[];
  recentDocs: Document[];
  searchHistory: string[];
  toasts: Toast[];
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
  status: number;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  version: string;
  environment: string;
  components: {
    database: string;
    scheduler: string;
    search: string;
  };
}

// Navigation types
export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

// Component prop types
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

// Event types
export interface KeyboardShortcut {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void;
  description: string;
  category: string;
}

// Analytics types
export interface AnalyticsEvent {
  event: string;
  properties?: Record<string, any>;
  timestamp?: string;
}

// Error types
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}