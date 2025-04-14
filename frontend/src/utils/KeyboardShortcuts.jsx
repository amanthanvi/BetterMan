// frontend/src/utils/KeyboardShortcuts.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const KeyboardShortcuts = ({ onToggleDarkMode }) => {
  const navigate = useNavigate();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts if user is typing in an input, textarea, etc.
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      ) {
        return;
      }

      // Keyboard shortcuts
      switch (e.key) {
        // Search shortcut: press / to focus search
        case '/':
          e.preventDefault();
          const searchInput = document.getElementById('search');
          if (searchInput) {
            searchInput.focus();
          }
          break;

        // Home: go to homepage
        case 'h':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            navigate('/');
          }
          break;

        // Back: go back in history
        case 'b':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            navigate(-1);
          }
          break;

        // Documentation: go to docs page
        case 'd':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            navigate('/docs');
          }
          break;

        // Search page
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            navigate('/search');
          }
          break;

        // Toggle dark mode
        case 't':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (onToggleDarkMode) onToggleDarkMode();
          }
          break;

        // Help modal with shortcut list
        case '?':
          e.preventDefault();
          setIsHelpModalOpen(true);
          break;

        // Escape to close modals
        case 'Escape':
          setIsHelpModalOpen(false);
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate, onToggleDarkMode]);

  return (
    <>
      {isHelpModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Keyboard Shortcuts</h3>
              <button
                onClick={() => setIsHelpModalOpen(false)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  /
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Focus search
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Ctrl/⌘ + H
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Go to homepage
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Ctrl/⌘ + B
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Go back
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Ctrl/⌘ + D
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Go to documentation
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Ctrl/⌘ + S
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Open search page
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Ctrl/⌘ + T
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Toggle dark mode
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  ?
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Show this help dialog
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Esc
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Close dialogs
                </div>
              </div>
            </div>
            <div className="mt-6">
              <button
                onClick={() => setIsHelpModalOpen(false)}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default KeyboardShortcuts;