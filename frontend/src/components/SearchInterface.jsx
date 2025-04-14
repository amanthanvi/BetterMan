// frontend/src/components/SearchInterface.jsx
import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';

const SearchInterface = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [docSet] = useState(searchParams.get('docSet') || 'linux');
  const [section, setSection] = useState(searchParams.get('section') || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [totalResults, setTotalResults] = useState(0);
  
  // Sections for filtering (these are the standard man page sections)
  const sections = [
    { id: '', name: 'All Sections' },
    { id: '1', name: '1 - User Commands' },
    { id: '2', name: '2 - System Calls' },
    { id: '3', name: '3 - Library Functions' },
    { id: '4', name: '4 - Special Files' },
    { id: '5', name: '5 - File Formats' },
    { id: '6', name: '6 - Games' },
    { id: '7', name: '7 - Miscellaneous' },
    { id: '8', name: '8 - System Administration' }
  ];

  // Perform search when query parameters change
  useEffect(() => {
    if (query.trim().length > 0) {
      performSearch();
    } else {
      setResults([]);
      setTotalResults(0);
    }
  }, [query, section]);

  // Update search parameters in URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (docSet) params.set('docSet', docSet);
    if (section) params.set('section', section);
    
    setSearchParams(params);
  }, [query, docSet, section, setSearchParams]);

  // Search API call
  const performSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setSearchError(null);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const params = new URLSearchParams({
        q: query
      });
      
      // Add section filter if selected
      if (section) {
        params.append('section', section);
      }
      
      const response = await fetch(`${apiUrl}/api/search?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Search response:", data); // Debug log
      
      // Correctly extract the results array from the response
      if (data && data.results) {
        setResults(data.results);
        setTotalResults(data.total || data.results.length);
      } else {
        // In case the API changes or returns unexpected format
        setResults([]);
        setTotalResults(0);
        console.error('Unexpected API response format:', data);
      }
    } catch (error) {
      console.error('Error performing search:', error);
      setSearchError(error.message);
      setResults([]);
      setTotalResults(0);
    } finally {
      setLoading(false);
    }
  };

  // Handle search form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    // Reset page and perform search
    performSearch();
  };

  // Navigate to document page
  const viewDocument = (docId) => {
    navigate(`/docs/${docId}`);
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Search Documentation</h1>
        
        {/* Search Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col md:flex-row md:space-x-4">
            {/* Search Query Input */}
            <div className="flex-1 mb-4 md:mb-0">
              <label htmlFor="search-query" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Search Query
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="text"
                  name="search-query"
                  id="search-query"
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-4 pr-12 sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-md"
                  placeholder="Enter search terms..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
            
            {/* Section Filter */}
            <div className="md:w-64">
              <label htmlFor="section" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Section
              </label>
              <select
                id="section"
                name="section"
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                value={section}
                onChange={(e) => setSection(e.target.value)}
              >
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>
      </div>
      
      {/* Search Results */}
      <div>
        {searchError && (
          <div className="bg-red-50 dark:bg-red-900 border-l-4 border-red-500 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500 dark:text-red-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-red-700 dark:text-red-300">
                  Error: {searchError}
                </p>
              </div>
            </div>
          </div>
        )}
        
        {query && !loading && !searchError && (
          <div className="mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalResults > 0 
                ? `Found ${totalResults} result${totalResults !== 1 ? 's' : ''} for "${query}"`
                : `No results found for "${query}"`
              }
            </p>
          </div>
        )}
        
        {/* Results List */}
        {results && results.length > 0 && (
          <div className="space-y-4">
            {results.map((result, index) => (
              <div
                key={result.id || index}
                className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    <button
                      onClick={() => viewDocument(result.id)}
                      className="hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none focus:underline"
                    >
                      {result.title}
                    </button>
                  </h3>
                  
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    {result.summary || 'No description available.'}
                  </p>
                  
                  {/* Score indicator (optional) */}
                  {result.score > 0 && (
                    <div className="mt-1">
                      <div className="relative pt-1">
                        <div className="overflow-hidden h-2 text-xs flex rounded bg-indigo-200 dark:bg-indigo-900">
                          <div 
                            style={{ width: `${Math.min(result.score * 100, 100)}%` }} 
                            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500"
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4">
                    <button
                      onClick={() => viewDocument(result.id)}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-5 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 dark:text-indigo-200 dark:bg-indigo-900 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      View Documentation
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchInterface;