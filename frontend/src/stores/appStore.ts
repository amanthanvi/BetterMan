import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface AppStore {
  // UI state
  darkMode: boolean;
  theme: 'light' | 'dark' | 'system';
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  documentTocOpen: boolean;
  currentDocument?: Document;
  
  // User preferences
  preferences: UserPreferences;
  
  // Data
  favorites: string[];
  recentDocs: Document[];
  recentDocuments: Document[]; // Alias
  searchHistory: string[];
  toasts: Toast[];
  user?: any;
  
  // Actions
  toggleDarkMode: () => void;
  setDarkMode: (darkMode: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setDocumentTocOpen: (open: boolean) => void;
  toggleDocumentToc: () => void;
  setCurrentDocument: (doc: Document | undefined) => void;
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
  addFavorite: (docId: string) => void;
  removeFavorite: (docId: string) => void;
  isFavorite: (docId: string) => boolean;
  setFavorites: (favorites: string[]) => void;
  addRecentDoc: (doc: Document) => void;
  addRecentDocument: (doc: Document) => void;
  clearRecentDocs: () => void;
  addSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  setUser: (user: any) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  removeToast: (id: string) => void;
  initialize: () => void;
}

// Default preferences
const defaultPreferences: UserPreferences = {
  theme: 'dark',
  fontSize: 'medium',
  fontFamily: 'system',
  compactMode: false,
  showLineNumbers: true,
  enableKeyboardShortcuts: true,
  language: 'en',
};

// Create store with persist
export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Initial state
      darkMode: true,
      theme: 'dark',
      sidebarOpen: true,
      commandPaletteOpen: false,
      documentTocOpen: true,
      currentDocument: undefined,
      preferences: defaultPreferences,
      favorites: [],
      recentDocs: [],
      recentDocuments: [],
      searchHistory: [],
      toasts: [],
      user: undefined,
      
      // Theme actions
      toggleDarkMode: () => {
        const newDarkMode = !get().darkMode;
        set({ 
          darkMode: newDarkMode,
          theme: newDarkMode ? 'dark' : 'light'
        });
        if (typeof document !== 'undefined') {
          if (newDarkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      },
      
      setDarkMode: (darkMode) => {
        set({ darkMode, theme: darkMode ? 'dark' : 'light' });
        if (typeof document !== 'undefined') {
          if (darkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      },
      
      setTheme: (theme) => {
        const isDark = theme === 'dark';
        set({ theme, darkMode: isDark });
        if (typeof document !== 'undefined') {
          if (isDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      },
      
      // UI actions
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleCommandPalette: () => set({ commandPaletteOpen: !get().commandPaletteOpen }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setDocumentTocOpen: (open) => set({ documentTocOpen: open }),
      toggleDocumentToc: () => set({ documentTocOpen: !get().documentTocOpen }),
      setCurrentDocument: (doc) => set({ currentDocument: doc }),
      
      // Preferences
      updatePreferences: (newPrefs) => set({ 
        preferences: { ...get().preferences, ...newPrefs } 
      }),
      resetPreferences: () => set({ preferences: defaultPreferences }),
      
      // Favorites
      addFavorite: (docId) => {
        const favorites = get().favorites;
        if (!favorites.includes(docId)) {
          set({ favorites: [...favorites, docId] });
        }
      },
      removeFavorite: (docId) => set({ 
        favorites: get().favorites.filter(id => id !== docId) 
      }),
      isFavorite: (docId) => get().favorites.includes(docId),
      setFavorites: (favorites) => set({ favorites }),
      
      // Recent docs
      addRecentDoc: (doc) => {
        const filtered = get().recentDocs.filter(d => d.id !== doc.id);
        const newDocs = [doc, ...filtered].slice(0, 10);
        set({ recentDocs: newDocs, recentDocuments: newDocs });
      },
      addRecentDocument: (doc) => {
        const filtered = get().recentDocs.filter(d => d.id !== doc.id);
        const newDocs = [doc, ...filtered].slice(0, 10);
        set({ recentDocs: newDocs, recentDocuments: newDocs });
      },
      clearRecentDocs: () => set({ recentDocs: [], recentDocuments: [] }),
      
      // Search history
      addSearchHistory: (query) => {
        if (!query.trim()) return;
        const history = get().searchHistory;
        if (!history.includes(query)) {
          set({ searchHistory: [query, ...history].slice(0, 20) });
        }
      },
      clearSearchHistory: () => set({ searchHistory: [] }),
      
      // User
      setUser: (user) => set({ user }),
      
      // Toasts
      addToast: (message, type) => {
        const toast = { id: Date.now().toString(), message, type };
        set({ toasts: [...get().toasts, toast] });
      },
      removeToast: (id) => set({ 
        toasts: get().toasts.filter(t => t.id !== id) 
      }),
      
      // Initialize
      initialize: () => {
        if (typeof document !== 'undefined') {
          document.documentElement.classList.add('dark');
          document.body?.classList.add('dark');
        }
        set({ darkMode: true, theme: 'dark' });
      },
    }),
    {
      name: 'betterman-storage',
      partialize: (state) => ({
        preferences: state.preferences,
        favorites: state.favorites,
        searchHistory: state.searchHistory,
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
        darkMode: state.darkMode,
        documentTocOpen: state.documentTocOpen,
      }),
    }
  )
);

// Initialize dark mode on load
if (typeof window !== 'undefined') {
  document.documentElement.classList.add('dark');
  if (document.body) {
    document.body.classList.add('dark');
  }
}