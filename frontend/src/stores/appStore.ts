import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppState, UserPreferences, Document } from '@/types';

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
  
  // Preferences actions
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
  
  // Favorites actions
  addFavorite: (docId: string) => void;
  removeFavorite: (docId: string) => void;
  isFavorite: (docId: string) => boolean;
  
  // Recent documents actions
  addRecentDoc: (doc: Document) => void;
  clearRecentDocs: () => void;
  
  // Search history actions
  addSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  
  // Initialization
  initialize: () => void;
}

const defaultPreferences: UserPreferences = {
  theme: 'system',
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
      darkMode: false,
      theme: 'system' as const,
      sidebarOpen: true,
      commandPaletteOpen: false,
      preferences: defaultPreferences,
      favorites: [],
      recentDocs: [],
      searchHistory: [],
      
      // Theme actions
      toggleDarkMode: () => set((state) => { 
        const newDarkMode = !state.darkMode;
        const newTheme = newDarkMode ? 'dark' : 'light';
        
        // Apply to DOM immediately
        document.documentElement.classList.toggle('dark', newDarkMode);
        
        return {
          darkMode: newDarkMode,
          theme: newTheme,
          preferences: { ...state.preferences, theme: newTheme }
        };
      }),
      setDarkMode: (darkMode: boolean) => {
        document.documentElement.classList.toggle('dark', darkMode);
        set({ darkMode });
      },
      setTheme: (theme: 'light' | 'dark') => {
        const isDark = theme === 'dark';
        document.documentElement.classList.toggle('dark', isDark);
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
      
      // Recent documents actions
      addRecentDoc: (doc: Document) =>
        set((state) => {
          const filtered = state.recentDocs.filter(d => d.id !== doc.id);
          return {
            recentDocs: [doc, ...filtered].slice(0, 10), // Keep last 10
          };
        }),
      clearRecentDocs: () => set({ recentDocs: [] }),
      
      // Search history actions
      addSearchHistory: (query: string) =>
        set((state) => {
          if (!query.trim() || state.searchHistory.includes(query)) return state;
          return {
            searchHistory: [query, ...state.searchHistory.filter(q => q !== query)].slice(0, 20),
          };
        }),
      clearSearchHistory: () => set({ searchHistory: [] }),
      
      // Initialization
      initialize: () => {
        const state = get();
        
        // Set dark mode based on system preference if theme is 'system'
        if (state.preferences.theme === 'system') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          set({ darkMode: prefersDark });
        } else {
          set({ darkMode: state.preferences.theme === 'dark' });
        }
        
        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => {
          if (state.preferences.theme === 'system') {
            set({ darkMode: e.matches });
          }
        };
        
        mediaQuery.addEventListener('change', handleChange);
        
        // Apply theme to document
        document.documentElement.classList.toggle('dark', get().darkMode);
        
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
      }),
    }
  )
);

// Subscribe to dark mode changes to update document class
useAppStore.subscribe(
  (state) => state.darkMode,
  (darkMode) => {
    document.documentElement.classList.toggle('dark', darkMode);
  }
);