import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppState, UserPreferences, Document } from '@/types';

// Feature flag for dark mode - set to true to enable dark mode functionality
const DARK_MODE_ENABLED = true;

interface AppStore extends AppState {
  // Theme property
  theme: 'light' | 'dark' | 'system';
  
  // Theme actions
  toggleDarkMode: () => void;
  setDarkMode: (darkMode: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  
  // UI actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  
  // Document viewer state
  documentTocOpen: boolean;
  setDocumentTocOpen: (open: boolean) => void;
  toggleDocumentToc: () => void;
  currentDocument?: Document;
  setCurrentDocument: (doc: Document | undefined) => void;
  
  // Preferences actions
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
  
  // Favorites actions
  addFavorite: (docId: string) => void;
  removeFavorite: (docId: string) => void;
  isFavorite: (docId: string) => boolean;
  setFavorites: (favorites: string[]) => void;
  
  // Recent documents actions (with alias)
  addRecentDoc: (doc: Document) => void;
  addRecentDocument: (doc: Document) => void; // Alias for addRecentDoc
  recentDocuments: Document[]; // Alias for recentDocs
  clearRecentDocs: () => void;
  
  // Search history actions
  addSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  
  // User state
  user?: any;
  setUser: (user: any) => void;
  
  // Toast actions
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  removeToast: (id: string) => void;
  
  // Initialization
  initialize: () => void;
}

const defaultPreferences: UserPreferences = {
  theme: 'dark',
  fontSize: 'medium',
  fontFamily: 'system',
  compactMode: false,
  showLineNumbers: true,
  enableKeyboardShortcuts: true,
  language: 'en',
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Initial state
      darkMode: true,
      theme: 'dark' as const,
      sidebarOpen: true,
      commandPaletteOpen: false,
      preferences: defaultPreferences,
      favorites: [],
      recentDocs: [],
      searchHistory: [],
      toasts: [],
      documentTocOpen: typeof window !== 'undefined' ? window.innerWidth > 1024 : true,
      currentDocument: undefined,
      user: undefined,
      
      // Alias getters
      get recentDocuments() {
        return get().recentDocs;
      },
      
      // Theme actions
      toggleDarkMode: () => {
        if (!DARK_MODE_ENABLED) return; // Feature flag check
        
        const state = get();
        const newDarkMode = !state.darkMode;
        const newTheme = newDarkMode ? 'dark' : 'light';
        
        // Apply to DOM immediately
        if (newDarkMode) {
          document.documentElement.classList.add('dark');
          document.body.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
          document.body.classList.remove('dark');
        }
        
        // Update state
        set({
          darkMode: newDarkMode,
          theme: newTheme,
          preferences: { ...state.preferences, theme: newTheme }
        });
      },
      setDarkMode: (darkMode: boolean) => {
        if (!DARK_MODE_ENABLED) return; // Feature flag check
        
        if (darkMode) {
          document.documentElement.classList.add('dark');
          document.body.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
          document.body.classList.remove('dark');
        }
        set({ darkMode });
      },
      setTheme: (theme: 'light' | 'dark') => {
        if (!DARK_MODE_ENABLED) return; // Feature flag check
        
        const isDark = theme === 'dark';
        if (isDark) {
          document.documentElement.classList.add('dark');
          document.body.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
          document.body.classList.remove('dark');
        }
        set({ 
          theme, 
          darkMode: isDark 
        });
      },
      
      // UI actions
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
      toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),
      
      // Document TOC actions
      setDocumentTocOpen: (open: boolean) => set({ documentTocOpen: open }),
      toggleDocumentToc: () => set((state) => ({ documentTocOpen: !state.documentTocOpen })),
      setCurrentDocument: (doc: Document | undefined) => set({ currentDocument: doc }),
      
      // Preferences actions
      updatePreferences: (newPreferences: Partial<UserPreferences>) =>
        set((state) => ({
          preferences: { ...state.preferences, ...newPreferences },
        })),
      resetPreferences: () => set({ preferences: defaultPreferences }),
      
      // Favorites actions
      addFavorite: (docId: string) =>
        set((state) => ({
          favorites: state.favorites.includes(docId) 
            ? state.favorites 
            : [...state.favorites, docId],
        })),
      removeFavorite: (docId: string) =>
        set((state) => ({
          favorites: state.favorites.filter(id => id !== docId),
        })),
      isFavorite: (docId: string) => get().favorites.includes(docId),
      setFavorites: (favorites: string[]) => set({ favorites }),
      
      // Recent documents actions
      addRecentDoc: (doc: Document) =>
        set((state) => {
          const filtered = state.recentDocs.filter(d => d.id !== doc.id);
          return {
            recentDocs: [doc, ...filtered].slice(0, 10), // Keep last 10
          };
        }),
      addRecentDocument: (doc: Document) => get().addRecentDoc(doc), // Alias
      clearRecentDocs: () => set({ recentDocs: [] }),
      
      // User actions
      setUser: (user: any) => set({ user }),
      
      // Search history actions
      addSearchHistory: (query: string) =>
        set((state) => {
          if (!query.trim() || state.searchHistory.includes(query)) return state;
          return {
            searchHistory: [query, ...state.searchHistory.filter(q => q !== query)].slice(0, 20),
          };
        }),
      clearSearchHistory: () => set({ searchHistory: [] }),
      
      // Toast actions
      addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => 
        set((state) => ({
          toasts: [...state.toasts, { id: Date.now().toString(), message, type }],
        })),
      removeToast: (id: string) =>
        set((state) => ({
          toasts: state.toasts.filter(t => t.id !== id),
        })),
      
      // Initialization
      initialize: () => {
        if (!DARK_MODE_ENABLED) {
          // When dark mode is disabled, always use light mode
          document.documentElement.classList.remove('dark');
          document.body.classList.remove('dark');
          set({ 
            darkMode: false,
            theme: 'light'
          });
          return;
        }
        
        // Apply dark mode immediately on initialization
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
        
        const state = get();
        let shouldBeDark = false;
        
        // Determine if dark mode should be enabled
        if (state.theme === 'dark' || (state.theme === 'system' && state.preferences.theme === 'dark')) {
          shouldBeDark = true;
        } else if (state.theme === 'system' || state.preferences.theme === 'system') {
          shouldBeDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        } else if (state.preferences.theme === 'dark') {
          shouldBeDark = true;
        }
        
        // Apply theme to document
        if (shouldBeDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        
        // Always set dark mode to true on initialization
        set({ 
          darkMode: true,
          theme: 'dark'
        });
        
        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => {
          const currentState = get();
          if (currentState.theme === 'system' || currentState.preferences.theme === 'system') {
            const newDarkMode = e.matches;
            if (newDarkMode) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
            set({ darkMode: newDarkMode });
          }
        };
        
        mediaQuery.addEventListener('change', handleChange);
        
        // Apply font preferences
        const root = document.documentElement;
        const body = document.body;
        
        // Apply font size
        if (state.preferences.fontSize === 'small') {
          root.style.fontSize = '14px';
        } else if (state.preferences.fontSize === 'large') {
          root.style.fontSize = '18px';
        } else {
          root.style.fontSize = '16px';
        }
        
        // Apply font family
        if (state.preferences.fontFamily === 'mono') {
          body.style.fontFamily = 'ui-monospace, monospace';
        } else if (state.preferences.fontFamily === 'serif') {
          body.style.fontFamily = 'ui-serif, serif';
        } else {
          body.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        }
      },
    }),
    {
      name: 'betterman-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        preferences: state.preferences,
        favorites: state.favorites,
        searchHistory: state.searchHistory,
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
        darkMode: state.darkMode,
        documentTocOpen: state.documentTocOpen,
      }),
      onRehydrateStorage: () => (state) => {
        if (!DARK_MODE_ENABLED) {
          // When dark mode is disabled, always ensure light mode
          document.documentElement.classList.remove('dark');
          document.body.classList.remove('dark');
          return;
        }
        
        // Always apply dark mode immediately after rehydration
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
        
        // Ensure state is set to dark mode
        if (state) {
          state.darkMode = true;
          state.theme = 'dark';
        }
      },
    }
  )
);

// Subscribe to dark mode changes to update document class
if (DARK_MODE_ENABLED) {
  useAppStore.subscribe(
    (state) => state.darkMode,
    (darkMode) => {
      if (darkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  );
}