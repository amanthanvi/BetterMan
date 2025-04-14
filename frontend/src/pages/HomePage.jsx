// frontend/src/pages/HomePage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const HomePage = ({ docs, loading }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  // Get recently viewed from local storage
  const getRecentlyViewed = () => {
    try {
      const storedRecent = localStorage.getItem('recentlyViewed');
      if (storedRecent) {
        return JSON.parse(storedRecent);
      }
    } catch (error) {
      console.error('Error parsing recently viewed:', error);
    }
    return [];
  };

  const recentlyViewed = getRecentlyViewed();

  // Handle search form submission
  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center py-16 px-4 sm:px-6 lg:py-24 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-5xl md:text-6xl">
            <span className="block">BetterMan</span>
            <span className="block text-indigo-600 dark:text-indigo-400">Modern Documentation</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 dark:text-gray-400 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            A modern, navigable, and accessible reinterpretation of Linux man pages and beyond.
          </p>
          
          {/* Hero Search */}
          <div className="mt-10 max-w-xl mx-auto">
            <form onSubmit={handleSearch} className="sm:flex">
              <label htmlFor="hero-search" className="sr-only">Search documentation</label>
              <input
                id="hero-search"
                type="text"
                placeholder="Search documentation (e.g., 'grep', 'ls', 'find')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-5 py-3 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-800 dark:text-white"
              />
              <button
                type="submit"
                className="mt-3 w-full px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:flex-shrink-0"
              >
                Search
              </button>
            </form>
          </div>
        </div>

        {/* Features Section */}
        <div className="py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="lg:text-center">
              <h2 className="text-base text-indigo-600 dark:text-indigo-400 font-semibold tracking-wide uppercase">Features</h2>
              <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                Better Documentation Experience
              </p>
              <p className="mt-4 max-w-2xl text-xl text-gray-500 dark:text-gray-400 lg:mx-auto">
                Transforming traditional Unix documentation into a more readable, navigable, and accessible format.
              </p>
            </div>

            <div className="mt-10">
              <div className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
                {/* Feature 1 */}
                <div className="relative">
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div className="ml-16">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">Readable Formatting</h3>
                    <p className="mt-2 text-base text-gray-500 dark:text-gray-400">
                      Enhanced typography and layout for better readability, with syntax highlighting for code examples.
                    </p>
                  </div>
                </div>

                {/* Feature 2 */}
                <div className="relative">
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div className="ml-16">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">Advanced Search</h3>
                    <p className="mt-2 text-base text-gray-500 dark:text-gray-400">
                      Full-text search with real-time suggestions, filters, and highlighted results.
                    </p>
                  </div>
                </div>

                {/* Feature 3 */}
                <div className="relative">
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                  </div>
                  <div className="ml-16">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">Dynamic Navigation</h3>
                    <p className="mt-2 text-base text-gray-500 dark:text-gray-400">
                      Interactive table of contents, related document links, and keyboard shortcuts for efficient browsing.
                    </p>
                  </div>
                </div>

                {/* Feature 4 */}
                <div className="relative">
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="ml-16">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">Expandable Framework</h3>
                    <p className="mt-2 text-base text-gray-500 dark:text-gray-400">
                      Built for future expansion to Python, Go, Pwntools, and other documentation sources.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Available Documentation */}
        {!loading && docs.length > 0 && (
          <div className="mt-10">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Available Documentation</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {docs.slice(0, 6).map((doc) => (
                <Link
                  key={doc.id}
                  to={`/docs/${doc.name}`}
                  className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">{doc.title}</h3>
                    {doc.section && (
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Section: {doc.section}</p>
                    )}
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                      {doc.summary || 'No description available.'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            {docs.length > 6 && (
              <div className="mt-6 text-center">
                <Link
                  to="/docs"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  View All Documentation
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Recently Viewed */}
        {recentlyViewed.length > 0 && (
          <div className="mt-10">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Recently Viewed</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentlyViewed.map((doc, idx) => (
                <Link
                  key={idx}
                  to={`/docs/${doc.name}`}
                  className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">{doc.title}</h3>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                      {doc.summary || 'No description available.'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;