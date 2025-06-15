// React polyfill to ensure React is available globally
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';

// Make React available globally before any other imports
if (typeof window !== 'undefined') {
  (window as any).React = React;
  (window as any).ReactDOM = ReactDOM;
  
  // Also make it available on globalThis for better compatibility
  (globalThis as any).React = React;
  (globalThis as any).ReactDOM = ReactDOM;
}

// Export everything to ensure availability
export { React, ReactDOM };
export default React;