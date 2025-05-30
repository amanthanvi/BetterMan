import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppState, UserPreferences, Document } from '@/types';

interface AppStore extends AppState {
  // Theme actions
  toggleDarkMode: () => void;
  setDarkMode: (darkMode: boolean) => void;
  
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
      sidebarOpen: true,
      commandPaletteOpen: false,
      preferences: defaultPreferences,
      favorites: [],
      recentDocs: [],
      searchHistory: [],
      
      // Theme actions
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      setDarkMode: (darkMode: boolean) => set({ darkMode }),
      
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