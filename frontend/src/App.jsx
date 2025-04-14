// frontend/src/App.jsx
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import './App.css';

// Import components
import NavBar from './components/NavBar';
import DocumentViewer from './components/DocumentViewer';
import SearchInterface from './components/SearchInterface';
import DarkModeToggle from './components/DarkModeToggle';
import KeyboardShortcuts from './utils/KeyboardShortcuts';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    // Check for saved preference or system preference
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('darkMode');
      if (savedMode !== null) {
        return savedMode === 'true';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  
  // Handle search from navbar
  const handleSearch = (query, docSet) => {
    // Navigate to search page with query params
    window.location.href = `/search?q=${encodeURIComponent(query)}&docSet=${docSet || 'linux'}`;
  };

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Add dark mode class to document root
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    // Save preference
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const response = await fetch(`${apiUrl}/api/docs`);
        const data = await response.json();
        setDocs(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching documentation:', error);
        setLoading(false);
      }
    };

    fetchDocs();
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-150 w-full">
        {/* Keyboard Shortcuts Handler */}
        <KeyboardShortcuts 
          onSearch={() => {}} 
          onToggleDarkMode={toggleDarkMode} 
        />
        
        {/* Navigation */}
        <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-150">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <Link to="/" className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    BetterMan
                  </Link>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <Link 
                    to="/" 
                    className="border-indigo-500 text-gray-900 dark:text-gray-100 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Home
                  </Link>
                  <Link 
                    to="/docs" 
                    className="border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Documentation
                  </Link>
                  <Link 
                    to="/search" 
                    className="border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Search
                  </Link>
                </div>
              </div>
              
              {/* Search Bar */}
              <div className="flex-1 flex items-center justify-center max-w-xs ml-6">
                <div className="w-full">
                  <label htmlFor="search" className="sr-only">Search</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <input
                      id="search"
                      name="search"
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white dark:bg-gray-700 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Search documentation..."
                      type="search"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSearch(e.target.value, 'linux');
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
              
              {/* Dark Mode Toggle */}
              <div className="flex items-center">
                <DarkModeToggle />
                
                {/* Help Button */}
                <button
                  onClick={() => {
                    const event = new KeyboardEvent('keydown', { key: '?' });
                    window.dispatchEvent(event);
                  }}
                  className="ml-2 p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  aria-label="Keyboard shortcuts help"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </header>
        
        {/* Main Content */}
        <div className="py-10">
          <main className="max-w-7xl mx-auto sm:px-6 lg:px-8 transition-colors duration-150">
            <Routes>
              {/* Home Page */}
              <Route path="/" element={<HomePage docs={docs} loading={loading} />} />
              
              {/* Documentation Viewer - Support both URL patterns */}
              <Route path="/docs/:docSet/:docId" element={<DocumentViewer />} />
              <Route path="/docs/:id" element={<DocumentViewer />} />
              
              {/* Documentation List */}
              <Route path="/docs" element={
                <div className="px-4 py-6 sm:px-0">
                  <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Available Documentation</h2>
                  {loading ? (
                    <div className="flex justify-center items-center h-64">
                      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {docs.map((doc) => (
                        <div key={doc.id} className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                          <div className="px-4 py-5 sm:p-6">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{doc.title}</h3>
                            {doc.section && (
                              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Section: {doc.section}
                              </p>
                            )}
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{doc.summary || 'No description available.'}</p>
                            <div className="mt-4">
                              <Link 
                                to={`/docs/${doc.name}`} 
                                className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-5 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 dark:text-indigo-200 dark:bg-indigo-900 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                              >
                                View Documentation
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              } />
              
              {/* Search Page */}
              <Route path="/search" element={<SearchInterface />} />
              
              {/* 404 - Not Found */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
        </div>
        
        {/* Footer */}
        <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-6 px-4 sm:px-6 lg:px-8 mt-8 transition-colors duration-150">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                &copy; {new Date().getFullYear()} BetterMan Project
              </p>
            </div>
            <div className="flex space-x-6">
              <Link to="/about" className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm">
                About
              </Link>
              <Link to="/contributing" className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm">
                Contributing
              </Link>
              <a 
                href="https://github.com/yourusername/BetterMan" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm"
              >
                GitHub
              </a>
              <Link to="/license" className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm">
                License
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;