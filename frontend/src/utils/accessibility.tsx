/**
 * Accessibility Utilities and Components
 * 
 * WCAG 2.1 AA compliant helpers and components for
 * ensuring BetterMan is accessible to all users.
 */

import React, { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Accessibility Context
interface A11yContextType {
  announcements: string[];
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
  prefersReducedMotion: boolean;
  highContrast: boolean;
  keyboardNavEnabled: boolean;
  setKeyboardNavEnabled: (enabled: boolean) => void;
}

const A11yContext = createContext<A11yContextType | undefined>(undefined);

export const useA11y = () => {
  const context = useContext(A11yContext);
  if (!context) {
    throw new Error('useA11y must be used within A11yProvider');
  }
  return context;
};

// Accessibility Provider
export const A11yProvider: React.FC<{ children: ReactNode } = ({ children }) => {
  const [announcements, setAnnouncements] = useState<string[]>([]);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [keyboardNavEnabled, setKeyboardNavEnabled] = useState(false);

  useEffect(() => {
    // Check user preferences
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contrastQuery = window.matchMedia('(prefers-contrast: high)');

    setPrefersReducedMotion(motionQuery.matches);
    setHighContrast(contrastQuery.matches);

    // Listen for changes
    const handleMotionChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    const handleContrastChange = (e: MediaQueryListEvent) => setHighContrast(e.matches);

    motionQuery.addEventListener('change', handleMotionChange);
    contrastQuery.addEventListener('change', handleContrastChange);

    // Detect keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setKeyboardNavEnabled(true);
      }
    };

    const handleMouseDown = () => {
      setKeyboardNavEnabled(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);

    return () => {
      motionQuery.removeEventListener('change', handleMotionChange);
      contrastQuery.removeEventListener('change', handleContrastChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    setAnnouncements(prev => [...prev, message]);
    
    // Clear announcement after it's been read
    setTimeout(() => {
      setAnnouncements(prev => prev.slice(1));
    }, 1000);
  };

  return (
    <A11yContext.Provider
      value={{
        announcements,
        announce,
        prefersReducedMotion,
        highContrast,
        keyboardNavEnabled,
        setKeyboardNavEnabled,
      >
    }
      {children}
      <LiveRegion announcements={announcements} />
    </A11yContext.Provider>
  );
};

// Live Region for screen reader announcements
const LiveRegion: React.FC<{ announcements: string[] } = ({ announcements }) => {
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcements[0]}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {announcements[1]}
      </div>
    </>
  );
};

// Skip Links Component
export const SkipLinks: React.FC = () => {
  return (
    <div className="skip-links">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <a href="#main-navigation" className="skip-link">
        Skip to navigation
      </a>
      <a href="#search" className="skip-link">
        Skip to search
      </a>
    </div>
  );
};

// Focus Manager Hook
export const useFocusManager = () => {
  const location = useLocation();
  const { announce } = useA11y();

  useEffect(() => {
    // Announce page changes
    const pageTitle = document.title;
    announce(`Navigated to ${pageTitle}`);

    // Focus management
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.setAttribute('tabindex', '-1');
      mainContent.focus();
      mainContent.removeAttribute('tabindex');
    }
  }, [location, announce]);
};

// Keyboard Navigation Hook
export const useKeyboardNavigation = (items: any[], onSelect: (item: any) => void) => {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => 
            prev < items.length - 1 ? prev + 1 : 0
          );
          break;
        
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => 
            prev > 0 ? prev - 1 : items.length - 1
          );
          break;
        
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0 && items[focusedIndex]) {
            onSelect(items[focusedIndex]);
          }
          break;
        
        case 'Home':
          e.preventDefault();
          setFocusedIndex(0);
          break;
        
        case 'End':
          e.preventDefault();
          setFocusedIndex(items.length - 1);
          break;
        
        case 'Escape':
          e.preventDefault();
          setFocusedIndex(-1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, focusedIndex, onSelect]);

  return { focusedIndex, setFocusedIndex };
};

// Focus Trap Hook
export const useFocusTrap = (isActive: boolean) => {
  useEffect(() => {
    if (!isActive) return;

    const trapContainer = document.querySelector('[data-focus-trap]');
    if (!trapContainer) return;

    const focusableElements = trapContainer.querySelectorAll(
      'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstFocusable = focusableElements[0] as HTMLElement;
    const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    };

    // Focus first element
    firstFocusable?.focus();

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isActive]);
};

// Accessible Icon Component
interface AccessibleIconProps {
  label: string;
  children: ReactNode;
}

export const AccessibleIcon: React.FC<AccessibleIconProps> = ({ label, children }) => {
  return (
    <span role="img" aria-label={label}
      {children}
    </span>
  );
};

// Visually Hidden Component
export const VisuallyHidden: React.FC<{ children: ReactNode } = ({ children }) => {
  return (
    <span className="sr-only">
      {children}
    </span>
  );
};

// ARIA Helpers
export const ariaHelpers = {
  // Generate unique IDs
  generateId: (prefix: string) => `${prefix}-${Math.random().toString(36).substr(2, 9)}`,
  
  // Check if element is visible
  isVisible: (element: HTMLElement) => {
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  },
  
  // Get focusable elements
  getFocusableElements: (container: HTMLElement) => {
    return container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input[type="text"]:not([disabled]), input[type="radio"]:not([disabled]), input[type="checkbox"]:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
  },
};

// Color Contrast Utilities
export const colorContrast = {
  // Calculate relative luminance
  getLuminance: (r: number, g: number, b: number) => {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  },
  
  // Calculate contrast ratio
  getContrastRatio: (l1: number, l2: number) => {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  },
  
  // Check if contrast meets WCAG AA
  meetsWCAG_AA: (ratio: number, isLargeText: boolean = false) => {
    return isLargeText ? ratio >= 3 : ratio >= 4.5;
  },
  
  // Check if contrast meets WCAG AAA
  meetsWCAG_AAA: (ratio: number, isLargeText: boolean = false) => {
    return isLargeText ? ratio >= 4.5 : ratio >= 7;
  },
};

// Accessible Form Field Component
interface AccessibleFieldProps {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  description?: string;
  children: ReactNode;
}

export const AccessibleField: React.FC<AccessibleFieldProps> = ({
  id,
  label,
  error,
  required,
  description,
  children,
}) => {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const ariaDescribedBy = [descriptionId, errorId].filter(Boolean).join(' ');

  return (
    <div className="form-field">
      <label htmlFor={id} className="form-label">
        {label}
        {required && <span aria-label="required" className="text-error-500">*</span>}
      </label>
      
      {description && (
        <p id={descriptionId} className="form-description">
          {description}
        </p>
      )}
      
      <div aria-describedby={ariaDescribedBy || undefined}
        {children}
      </div>
      
      {error && (
        <p id={errorId} role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
};

// CSS for skip links and screen reader only content
export const a11yStyles = `
  .skip-links {
    position: absolute;
    top: -40px;
    left: 0;
    background: #000;
    color: #fff;
    padding: 8px;
    text-decoration: none;
    z-index: 100;
  }

  .skip-link:focus {
    top: 0;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  .focus-visible {
    outline: 2px solid #4f46e5;
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }

  @media (prefers-contrast: high) {
    :root {
      --color-primary: #0000ff;
      --color-secondary: #008000;
      --color-error: #ff0000;
      --color-warning: #ffff00;
      --color-success: #00ff00;
    }
  }
`;