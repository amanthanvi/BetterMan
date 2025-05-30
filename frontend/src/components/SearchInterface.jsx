// frontend/src/components/SearchInterface.jsx
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import useDebounce from '../utils/useDebounce'; // Make sure to create this utility

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
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const [hasMore, setHasMore] = useState(false);
  
  // Ref for search suggestions
  const suggestionsRef = useRef(null);
  
  // Debounce search query to prevent too many API calls
  const debouncedQuery = useDebounce(query, 300);
  
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
    if (debouncedQuery.trim().length > 0) {
      performSearch();
    } else {
      setResults([]);
      setTotalResults(0);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [debouncedQuery, section, page]);

  // Update search parameters in URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (docSet) params.set('docSet', docSet);
    if (section) params.set('section', section);
    if (page > 1) params.set('page', page.toString());
    
    setSearchParams(params);
  }, [query, docSet, section, page, setSearchParams]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [suggestionsRef]);

  // Search API call
  const performSearch = async () => {
    if (!debouncedQuery.trim()) return;
    
    setLoading(true);
    setSearchError(null);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const params = new URLSearchParams({
        q: debouncedQuery,
        page: page,
        per_page: 10
      });
      
      // Add section filter if selected
      if (section) {
        params.append('section', section);
      }
      
      // Call the search API
      const response = await fetch(`${apiUrl}/api/search?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Search response:", data); // Debug log
      
      // Extract results
      if (data && data.results) {
        setResults(page === 1 ? data.results : [...results, ...data.results]);
        setTotalResults(data.total || data.results.length);
        setHasMore(data.has_more || false);
        
        // Update suggestions for autocomplete
        if (page === 1) {
          const uniqueTitles = [...new Set(data.results.map(item => item.title))];
          setSuggestions(uniqueTitles.slice(0, 5));
        }
      } else {
        // Handle unexpected format
        if (page === 1) {
          setResults([]);
          setTotalResults(0);
          setHasMore(false);
          setSuggestions([]);
        }
        console.error('Unexpected API response format:', data);
      }
    } catch (error) {
      console.error('Error performing search:', error);
      setSearchError(error.message);
      if (page === 1) {
        setResults([]);
        setTotalResults(0);
        setHasMore(false);
        setSuggestions([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Get search suggestions
  const getSuggestions = async () => {
    if (!query.trim() || query.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const params = new URLSearchParams({
        q: query,
        per_page: 5
      });
      
      const response = await fetch(`${apiUrl}/api/search?${params.toString()}`);
      
      if (!response.ok) {
        return;
      }
      
      const data = await response.json();
      
      if (data && data.results) {
        const uniqueTitles = [...new Set(data.results.map(item => item.title))];
        setSuggestions(uniqueTitles.slice(0, 5));
        setShowSuggestions(uniqueTitles.length > 0);
      }
    } catch (error) {
      console.error('Error getting suggestions:', error);
      setSuggestions([]);
    }
  };

  // Handle search input change
  const handleQueryChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    
    if (newQuery.trim().length >= 1) {
      getSuggestions();
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Handle search form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    setPage(1); // Reset to first page on new search
    setShowSuggestions(false);
    performSearch();
  };

  // Handle suggestion selection
  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    setPage(1);
    // Trigger search immediately
    setTimeout(() => performSearch(), 0);
  };

  // Navigate to document page
  const viewDocument = (docId) => {
    navigate(`/docs/${docId}`);
  };

  // Load more results
  const loadMoreResults = () => {
    setPage(prevPage => prevPage + 1);
  };

  // Render HTML content safely
  const renderHTML = (html) => {
    return { __html: html };
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Search Documentation</h1>
        
        {/* Search Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col md:flex-row md:space-x-4">
            {/* Search Query Input */}
            <div className="flex-1 mb-4 md:mb-0 relative">
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
                  onChange={handleQueryChange}
                  onFocus={() => setShowSuggestions(suggestions.length > 0)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowSuggestions(false);
                  }}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              
              {/* Search Suggestions */}
              {showSuggestions && (
                <div 
                  ref={suggestionsRef}
                  className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"
                >
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="cursor-pointer px-4 py-2 text-gray-900 dark:text-white hover:bg-indigo-100 dark:hover:bg-indigo-900"
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
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
                onChange={(e) => {
                  setSection(e.target.value);
                  setPage(1); // Reset page when changing filters
                }}
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
        
        {debouncedQuery && !loading && !searchError && (
          <div className="mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalResults > 0 
                ? `Found ${totalResults} result${totalResults !== 1 ? 's' : ''} for "${debouncedQuery}"`
                : `No results found for "${debouncedQuery}"`
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
                      dangerouslySetInnerHTML={renderHTML(
                        result.highlighted_title || result.title
                      )}
                    />
                  </h3>
                  
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    {result.summary || 'No description available.'}
                  </p>
                  
                  {/* Matches/Excerpts */}
                  {result.matches && result.matches.length > 0 && (
                    <div className="mt-3 text-sm text-gray-500 dark:text-gray-400 border-l-4 border-indigo-200 dark:border-indigo-800 pl-3">
                      {result.matches.map((match, idx) => (
                        <div 
                          key={idx} 
                          className="mb-1"
                          dangerouslySetInnerHTML={renderHTML(match)}
                        />
                      ))}
                    </div>
                  )}
                  
                  {/* Search Score Indicator */}
                  {typeof result.score === 'number' && result.score > 0 && (
                    <div className="mt-1">
                      <div className="relative pt-1">
                        <div className="overflow-hidden h-2 text-xs flex rounded bg-indigo-200 dark:bg-indigo-900">
                          <div 
                            style={{ width: `${Math.min(Math.max(result.score * 20, 10), 100)}%` }} 
                            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500"
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Section Badge */}
                  {result.section && (
                    <div className="mt-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        Section {result.section}
                      </span>
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
            
            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={loadMoreResults}
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  {loading ? 'Loading...' : 'Load More Results'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchInterface;