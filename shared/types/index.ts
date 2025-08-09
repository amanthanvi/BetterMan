// Shared type definitions for BetterMan

export interface ManPage {
  name: string;
  section: number;
  description: string;
  synopsis?: string;
  options?: ManPageOption[];
  examples?: ManPageExample[];
  seeAlso?: string[];
  author?: string;
  bugs?: string;
  copyright?: string;
  category?: string;
  complexity?: 'basic' | 'intermediate' | 'advanced';
  content?: string;
  formattedContent?: string;
  plainContent?: string;
  lastUpdated?: string;
}

export interface ManPageOption {
  flag: string;
  description: string;
  argument?: string;
}

export interface ManPageExample {
  command: string;
  description: string;
  output?: string;
}

export interface SearchResult {
  id: string;
  name: string;
  section: number;
  description: string;
  score: number;
  highlight?: string;
  category?: string;
}

export interface SearchQuery {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
}

export interface SearchFilters {
  sections?: number[];
  categories?: string[];
  complexity?: string[];
}

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  fontSize?: 'small' | 'medium' | 'large';
  keyboardShortcuts?: boolean;
  recentlyViewed?: string[];
  bookmarks?: string[];
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}