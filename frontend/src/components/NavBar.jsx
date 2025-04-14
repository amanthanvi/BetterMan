// frontend/src/components/NavBar.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';

const NavBar = ({ onSearch }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [docSet] = useState('linux');

  // Handle search form submission
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim().length > 0) {
      onSearch(searchQuery, docSet);
    }
  };

  return (
    <div className="w-full flex justify-between items-center">
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
      
      {/* Mobile menu button */}
      <div className="flex sm:hidden">
        <button
          type="button"
          className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
          aria-expanded="false"
        >
          <span className="sr-only">Open main menu</span>
          <svg
            className="block h-6 w-6"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>
      
      {/* Search form */}
      <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            id="navbar-search"
            name="navbar-search"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white dark:bg-gray-700 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Search documentation..."
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Search
        </button>
      </form>
    </div>
  );
};

export default NavBar;