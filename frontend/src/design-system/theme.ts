/**
 * BetterMan Premium Design System
 * Modern, elegant theme configuration
 */

export const theme = {
  colors: {
    // Primary - Blue gradient
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
    
    // Secondary - Purple
    secondary: {
      50: '#faf5ff',
      100: '#f3e8ff',
      200: '#e9d5ff',
      300: '#d8b4fe',
      400: '#c084fc',
      500: '#a855f7',
      600: '#9333ea',
      700: '#7c3aed',
      800: '#6b21a8',
      900: '#581c87',
      950: '#3b0764',
    },
    
    // Accent - Emerald
    accent: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981',
      600: '#059669',
      700: '#047857',
      800: '#065f46',
      900: '#064e3b',
      950: '#022c22',
    },
    
    // Neutral grays with blue undertones
    gray: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
    
    // Semantic colors
    success: {
      light: '#4ade80',
      DEFAULT: '#22c55e',
      dark: '#16a34a',
    },
    
    warning: {
      light: '#fbbf24',
      DEFAULT: '#f59e0b',
      dark: '#d97706',
    },
    
    error: {
      light: '#f87171',
      DEFAULT: '#ef4444',
      dark: '#dc2626',
    },
    
    info: {
      light: '#60a5fa',
      DEFAULT: '#3b82f6',
      dark: '#2563eb',
    },
  },
  
  spacing: {
    xs: '0.25rem',    // 4px
    sm: '0.5rem',     // 8px
    md: '1rem',       // 16px
    lg: '1.5rem',     // 24px
    xl: '2rem',       // 32px
    '2xl': '3rem',    // 48px
    '3xl': '4rem',    // 64px
    '4xl': '6rem',    // 96px
  },
  
  typography: {
    fonts: {
      sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: '"JetBrains Mono", "SF Mono", Monaco, Consolas, monospace',
      display: '"Cal Sans", Inter, sans-serif',
    },
    
    sizes: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem', // 36px
      '5xl': '3rem',    // 48px
      '6xl': '3.75rem', // 60px
    },
    
    weights: {
      thin: 100,
      light: 300,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900,
    },
    
    lineHeights: {
      tight: 1.1,
      snug: 1.3,
      normal: 1.5,
      relaxed: 1.7,
      loose: 2,
    },
  },
  
  shadows: {
    xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    glow: '0 0 20px rgb(59 130 246 / 0.5)',
  },
  
  radius: {
    none: '0',
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    '3xl': '1.5rem',
    full: '9999px',
  },
  
  animations: {
    durations: {
      fast: '150ms',
      normal: '300ms',
      slow: '500ms',
      slower: '750ms',
      slowest: '1000ms',
    },
    
    easings: {
      linear: 'linear',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      out: 'cubic-bezier(0, 0, 0.2, 1)',
      inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    },
  },
  
  effects: {
    glass: {
      light: 'backdrop-blur-md bg-white/80 border border-gray-200/50',
      dark: 'backdrop-blur-md bg-gray-900/80 border border-gray-700/50',
    },
    
    gradient: {
      primary: 'bg-gradient-to-r from-blue-500 to-purple-600',
      secondary: 'bg-gradient-to-r from-purple-500 to-pink-500',
      accent: 'bg-gradient-to-r from-emerald-500 to-teal-600',
      sunset: 'bg-gradient-to-r from-orange-400 to-pink-600',
      ocean: 'bg-gradient-to-r from-blue-600 to-cyan-500',
      forest: 'bg-gradient-to-r from-emerald-600 to-green-700',
    },
    
    glow: {
      primary: 'shadow-lg shadow-blue-500/25',
      secondary: 'shadow-lg shadow-purple-500/25',
      accent: 'shadow-lg shadow-emerald-500/25',
    },
  },
  
  breakpoints: {
    xs: '475px',
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
};

// Dark mode configuration
export const darkMode = {
  background: {
    primary: theme.colors.gray[950],
    secondary: theme.colors.gray[900],
    tertiary: theme.colors.gray[800],
    elevated: theme.colors.gray[800],
  },
  
  text: {
    primary: theme.colors.gray[50],
    secondary: theme.colors.gray[300],
    tertiary: theme.colors.gray[400],
    muted: theme.colors.gray[500],
  },
  
  border: {
    primary: theme.colors.gray[800],
    secondary: theme.colors.gray[700],
    tertiary: theme.colors.gray[600],
  },
};

// Light mode configuration  
export const lightMode = {
  background: {
    primary: '#ffffff',
    secondary: theme.colors.gray[50],
    tertiary: theme.colors.gray[100],
    elevated: '#ffffff',
  },
  
  text: {
    primary: theme.colors.gray[900],
    secondary: theme.colors.gray[700],
    tertiary: theme.colors.gray[600],
    muted: theme.colors.gray[500],
  },
  
  border: {
    primary: theme.colors.gray[200],
    secondary: theme.colors.gray[300],
    tertiary: theme.colors.gray[400],
  },
};

// Component variants
export const components = {
  button: {
    sizes: {
      xs: 'px-2.5 py-1.5 text-xs',
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-2.5 text-base',
      lg: 'px-6 py-3 text-lg',
      xl: 'px-8 py-4 text-xl',
    },
    
    variants: {
      primary: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg',
      secondary: 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100',
      ghost: 'hover:bg-gray-100 dark:hover:bg-gray-800',
      danger: 'bg-red-500 hover:bg-red-600 text-white',
      success: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    },
  },
  
  card: {
    base: 'bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800',
    hover: 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200',
    interactive: 'cursor-pointer hover:scale-[1.02] transition-transform duration-200',
  },
  
  input: {
    base: 'w-full px-4 py-2.5 rounded-lg border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200',
    sizes: {
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-2.5 text-base',
      lg: 'px-5 py-3 text-lg',
    },
  },
};

// Utility functions
export const getColorValue = (path: string) => {
  const keys = path.split('.');
  let value: any = theme.colors;
  
  for (const key of keys) {
    value = value[key];
    if (!value) return undefined;
  }
  
  return value;
};

export const applyTheme = (mode: 'light' | 'dark') => {
  const root = document.documentElement;
  const modeConfig = mode === 'dark' ? darkMode : lightMode;
  
  // Apply CSS variables
  Object.entries(modeConfig.background).forEach(([key, value]) => {
    root.style.setProperty(`--color-bg-${key}`, value);
  });
  
  Object.entries(modeConfig.text).forEach(([key, value]) => {
    root.style.setProperty(`--color-text-${key}`, value);
  });
  
  Object.entries(modeConfig.border).forEach(([key, value]) => {
    root.style.setProperty(`--color-border-${key}`, value);
  });
};