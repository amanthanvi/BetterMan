/**
 * Keyboard shortcuts manager for BetterMan
 * Provides a centralized way to manage keyboard shortcuts throughout the app
 */

import { useEffect, useCallback } from 'react';

export interface Shortcut {
  key: string;
  ctrl?: boolean;
  cmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
  enabled?: boolean;
  preventDefault?: boolean;
}

export interface ShortcutGroup {
  name: string;
  shortcuts: Shortcut[];
}

// Global shortcuts registry
const globalShortcuts: Map<string, Shortcut> = new Map();

// Helper to generate shortcut key
const generateShortcutKey = (shortcut: Shortcut): string => {
  const parts = [];
  if (shortcut.ctrl) parts.push('ctrl');
  if (shortcut.cmd) parts.push('cmd');
  if (shortcut.shift) parts.push('shift');
  if (shortcut.alt) parts.push('alt');
  parts.push(shortcut.key.toLowerCase());
  return parts.join('+');
};

// Helper to check if event matches shortcut
const eventMatchesShortcut = (event: KeyboardEvent, shortcut: Shortcut): boolean => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
  
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    (shortcut.ctrl ? ctrlKey : !ctrlKey) &&
    (shortcut.cmd ? event.metaKey : !event.metaKey) &&
    (shortcut.shift ? event.shiftKey : !event.shiftKey) &&
    (shortcut.alt ? event.altKey : !event.altKey)
  );
};

// Register a shortcut globally
export const registerShortcut = (shortcut: Shortcut): void => {
  const key = generateShortcutKey(shortcut);
  globalShortcuts.set(key, shortcut);
};

// Unregister a shortcut
export const unregisterShortcut = (shortcut: Shortcut): void => {
  const key = generateShortcutKey(shortcut);
  globalShortcuts.delete(key);
};

// Get all registered shortcuts grouped by category
export const getShortcutGroups = (): ShortcutGroup[] => {
  const groups: Record<string, Shortcut[]> = {
    Navigation: [],
    Search: [],
    Document: [],
    Application: [],
  };

  globalShortcuts.forEach((shortcut) => {
    let category = 'Application';
    
    if (shortcut.description.toLowerCase().includes('search')) {
      category = 'Search';
    } else if (shortcut.description.toLowerCase().includes('navigate') || 
               shortcut.description.toLowerCase().includes('go to')) {
      category = 'Navigation';
    } else if (shortcut.description.toLowerCase().includes('document') ||
               shortcut.description.toLowerCase().includes('copy') ||
               shortcut.description.toLowerCase().includes('bookmark')) {
      category = 'Document';
    }
    
    groups[category].push(shortcut);
  });

  return Object.entries(groups)
    .filter(([_, shortcuts]) => shortcuts.length > 0)
    .map(([name, shortcuts]) => ({ name, shortcuts }));
};

// Format shortcut for display
export const formatShortcut = (shortcut: Shortcut): string => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const parts = [];
  
  if (shortcut.ctrl && !isMac) parts.push('Ctrl');
  if (shortcut.cmd || (shortcut.ctrl && isMac)) parts.push('⌘');
  if (shortcut.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (shortcut.alt) parts.push(isMac ? '⌥' : 'Alt');
  
  const key = shortcut.key.length === 1 
    ? shortcut.key.toUpperCase() 
    : shortcut.key;
  
  parts.push(key);
  
  return parts.join(isMac ? '' : '+');
};

// React hook for using keyboard shortcuts
export const useKeyboardShortcuts = (
  shortcuts: Shortcut[],
  deps: React.DependencyList = []
): void => {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    const isContentEditable = target.contentEditable === 'true';
    
    if (isInput || isContentEditable) {
      return;
    }

    for (const shortcut of shortcuts) {
      if (shortcut.enabled === false) continue;
      
      if (eventMatchesShortcut(event, shortcut)) {
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
          event.stopPropagation();
        }
        shortcut.action();
        break;
      }
    }
  }, [...deps, shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

// Default shortcuts for BetterMan
export const defaultShortcuts: Shortcut[] = [
  // Search
  {
    key: 'k',
    ctrl: true,
    description: 'Open command palette',
    action: () => {
      const event = new CustomEvent('openCommandPalette');
      window.dispatchEvent(event);
    },
  },
  {
    key: '/',
    description: 'Focus search',
    action: () => {
      const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement;
      searchInput?.focus();
    },
  },
  
  // Navigation
  {
    key: 'g',
    shift: true,
    description: 'Go to home',
    action: () => {
      window.location.href = '/';
    },
  },
  {
    key: 'd',
    shift: true,
    description: 'Go to documentation',
    action: () => {
      window.location.href = '/docs';
    },
  },
  {
    key: 'f',
    shift: true,
    description: 'Go to favorites',
    action: () => {
      window.location.href = '/favorites';
    },
  },
  
  // Document actions
  {
    key: 'b',
    ctrl: true,
    description: 'Toggle bookmark',
    action: () => {
      const event = new CustomEvent('toggleBookmark');
      window.dispatchEvent(event);
    },
  },
  {
    key: 'c',
    ctrl: true,
    shift: true,
    description: 'Copy document link',
    action: () => {
      navigator.clipboard.writeText(window.location.href);
    },
  },
  
  // UI controls
  {
    key: 't',
    ctrl: true,
    description: 'Toggle table of contents',
    action: () => {
      const event = new CustomEvent('toggleToc');
      window.dispatchEvent(event);
    },
  },
  {
    key: 'd',
    ctrl: true,
    description: 'Toggle dark mode',
    action: () => {
      const event = new CustomEvent('toggleDarkMode');
      window.dispatchEvent(event);
    },
  },
  {
    key: '?',
    description: 'Show keyboard shortcuts',
    action: () => {
      const event = new CustomEvent('showKeyboardShortcuts');
      window.dispatchEvent(event);
    },
  },
];

// Initialize default shortcuts
defaultShortcuts.forEach(registerShortcut);