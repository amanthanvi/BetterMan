import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client' // v18.3.1
import './index.css'
import App from './App'
// import * as serviceWorker from './utils/serviceWorker'
import { useAppStore } from './stores/appStore'

// Make store available globally for toast
(window as any).__appStore = useAppStore.getState();

// Enable performance monitoring in development
if (import.meta.env.DEV) {
  // Log render performance
  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      console.log(`${entry.name}: ${entry.duration.toFixed(2)}ms`)
    })
  })
  observer.observe({ entryTypes: ['measure'] })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Unregister any existing service workers to fix CORS issues
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister();
      console.log('Service worker unregistered:', registration);
    }
  });
}

// Register service worker for offline functionality
// Commented out temporarily for debugging
// serviceWorker.register({ ... })
