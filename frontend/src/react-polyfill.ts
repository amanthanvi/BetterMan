// React polyfill to ensure React is available globally
import React from 'react';
import ReactDOM from 'react-dom/client';

// Make React available globally
(window as any).React = React;
(window as any).ReactDOM = ReactDOM;

export { React, ReactDOM };
export default React;