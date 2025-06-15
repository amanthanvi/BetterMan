// Simple store implementation without Zustand to avoid initialization issues

// Types
interface Document {
  id: string;
  title: string;
  command: string;
  description?: string;
  content?: string;
  lastViewed?: Date;
}

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  fontFamily: 'system' | 'mono' | 'serif';
  compactMode: boolean;
  showLineNumbers: boolean;
  enableKeyboardShortcuts: boolean;
  language: string;
}

interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
}

interface AppState {
  darkMode: boolean;
  theme: 'light' | 'dark' | 'system';
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  documentTocOpen: boolean;
  currentDocument?: Document;
  preferences: UserPreferences;
  favorites: string[];
  recentDocs: Document[];
  recentDocuments: Document[];
  searchHistory: string[];
  toasts: Toast[];
  user?: any;
}

// Default state
const defaultState: AppState = {
  darkMode: true,
  theme: 'dark',
  sidebarOpen: true,
  commandPaletteOpen: false,
  documentTocOpen: true,
  currentDocument: undefined,
  preferences: {
    theme: 'dark',
    fontSize: 'medium',
    fontFamily: 'system',
    compactMode: false,
    showLineNumbers: true,
    enableKeyboardShortcuts: true,
    language: 'en',
  },
  favorites: [],
  recentDocs: [],
  recentDocuments: [],
  searchHistory: [],
  toasts: [],
  user: undefined,
};

// Load state from localStorage
function loadState(): AppState {
  if (typeof window === 'undefined') return defaultState;
  
  try {
    const saved = localStorage.getItem('betterman-storage');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultState, ...parsed.state };
    }
  } catch (e) {
    console.error('Failed to load state:', e);
  }
  
  return defaultState;
}

// Save state to localStorage
function saveState(state: AppState) {
  if (typeof window === 'undefined') return;
  
  try {
    const toSave = {
      state: {
        preferences: state.preferences,
        favorites: state.favorites,
        searchHistory: state.searchHistory,
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
        darkMode: state.darkMode,
        documentTocOpen: state.documentTocOpen,
      },
      version: 0,
    };
    localStorage.setItem('betterman-storage', JSON.stringify(toSave));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

// Store implementation
class AppStoreImpl {
  private state: AppState;
  private listeners: Set<(state: AppState) => void> = new Set();

  constructor() {
    this.state = loadState();
    
    // Apply dark mode on initialization
    if (typeof document !== 'undefined') {
      if (this.state.darkMode) {
        document.documentElement.classList.add('dark');
        document.body?.classList.add('dark');
      }
    }
  }

  getState = () => this.state;

  setState = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => {
    const update = typeof partial === 'function' ? partial(this.state) : partial;
    this.state = { ...this.state, ...update };
    saveState(this.state);
    this.listeners.forEach(listener => listener(this.state));
  };

  subscribe = (listener: (state: AppState) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // Actions
  toggleDarkMode = () => {
    const newDarkMode = !this.state.darkMode;
    this.setState({ darkMode: newDarkMode, theme: newDarkMode ? 'dark' : 'light' });
    if (typeof document !== 'undefined') {
      if (newDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  setDarkMode = (darkMode: boolean) => {
    this.setState({ darkMode, theme: darkMode ? 'dark' : 'light' });
    if (typeof document !== 'undefined') {
      if (darkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  setTheme = (theme: 'light' | 'dark') => {
    const isDark = theme === 'dark';
    this.setState({ theme, darkMode: isDark });
    if (typeof document !== 'undefined') {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  toggleSidebar = () => this.setState({ sidebarOpen: !this.state.sidebarOpen });
  setSidebarOpen = (open: boolean) => this.setState({ sidebarOpen: open });
  toggleCommandPalette = () => this.setState({ commandPaletteOpen: !this.state.commandPaletteOpen });
  setCommandPaletteOpen = (open: boolean) => this.setState({ commandPaletteOpen: open });
  setDocumentTocOpen = (open: boolean) => this.setState({ documentTocOpen: open });
  toggleDocumentToc = () => this.setState({ documentTocOpen: !this.state.documentTocOpen });
  setCurrentDocument = (doc: Document | undefined) => this.setState({ currentDocument: doc });

  updatePreferences = (newPrefs: Partial<UserPreferences>) => {
    this.setState({ preferences: { ...this.state.preferences, ...newPrefs } });
  };

  resetPreferences = () => {
    this.setState({ preferences: defaultState.preferences });
  };

  addFavorite = (docId: string) => {
    if (!this.state.favorites.includes(docId)) {
      this.setState({ favorites: [...this.state.favorites, docId] });
    }
  };

  removeFavorite = (docId: string) => {
    this.setState({ favorites: this.state.favorites.filter(id => id !== docId) });
  };

  isFavorite = (docId: string) => this.state.favorites.includes(docId);
  setFavorites = (favorites: string[]) => this.setState({ favorites });

  addRecentDoc = (doc: Document) => {
    const filtered = this.state.recentDocs.filter(d => d.id !== doc.id);
    const newDocs = [doc, ...filtered].slice(0, 10);
    this.setState({ recentDocs: newDocs, recentDocuments: newDocs });
  };

  addRecentDocument = (doc: Document) => this.addRecentDoc(doc);
  clearRecentDocs = () => this.setState({ recentDocs: [], recentDocuments: [] });

  addSearchHistory = (query: string) => {
    if (!query.trim()) return;
    if (!this.state.searchHistory.includes(query)) {
      this.setState({ searchHistory: [query, ...this.state.searchHistory].slice(0, 20) });
    }
  };

  clearSearchHistory = () => this.setState({ searchHistory: [] });
  setUser = (user: any) => this.setState({ user });

  addToast = (message: string, type?: 'success' | 'error' | 'info' | 'warning') => {
    const toast = { id: Date.now().toString(), message, type };
    this.setState({ toasts: [...this.state.toasts, toast] });
  };

  removeToast = (id: string) => {
    this.setState({ toasts: this.state.toasts.filter(t => t.id !== id) });
  };

  initialize = () => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('dark');
      document.body?.classList.add('dark');
    }
    this.setState({ darkMode: true, theme: 'dark' });
  };
}

// Create single instance
const store = new AppStoreImpl();

// Export store instance for direct access
export const appStore = store;

// React hook
import { useEffect, useState } from 'react';

export function useAppStore() {
  const [state, setState] = useState(store.getState());

  useEffect(() => {
    return store.subscribe(setState);
  }, []);

  return {
    ...state,
    toggleDarkMode: store.toggleDarkMode,
    setDarkMode: store.setDarkMode,
    setTheme: store.setTheme,
    toggleSidebar: store.toggleSidebar,
    setSidebarOpen: store.setSidebarOpen,
    toggleCommandPalette: store.toggleCommandPalette,
    setCommandPaletteOpen: store.setCommandPaletteOpen,
    setDocumentTocOpen: store.setDocumentTocOpen,
    toggleDocumentToc: store.toggleDocumentToc,
    setCurrentDocument: store.setCurrentDocument,
    updatePreferences: store.updatePreferences,
    resetPreferences: store.resetPreferences,
    addFavorite: store.addFavorite,
    removeFavorite: store.removeFavorite,
    isFavorite: store.isFavorite,
    setFavorites: store.setFavorites,
    addRecentDoc: store.addRecentDoc,
    addRecentDocument: store.addRecentDocument,
    clearRecentDocs: store.clearRecentDocs,
    addSearchHistory: store.addSearchHistory,
    clearSearchHistory: store.clearSearchHistory,
    setUser: store.setUser,
    addToast: store.addToast,
    removeToast: store.removeToast,
    initialize: store.initialize,
  };
}

// Initialize dark mode on load
if (typeof window !== 'undefined') {
  document.documentElement.classList.add('dark');
  if (document.body) {
    document.body.classList.add('dark');
  }
}