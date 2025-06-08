import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cross2Icon, KeyboardIcon } from '@radix-ui/react-icons';
import { cn } from '@/utils/cn';
import { getShortcutGroups, formatShortcut, ShortcutGroup } from '@/utils/keyboardShortcuts';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [shortcutGroups, setShortcutGroups] = useState<ShortcutGroup[]>([]);

  useEffect(() => {
    if (isOpen) {
      setShortcutGroups(getShortcutGroups());
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50",
              "w-full max-w-2xl max-h-[80vh]",
              "bg-white dark:bg-gray-900",
              "rounded-2xl shadow-2xl",
              "overflow-hidden"
            )}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <KeyboardIcon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Keyboard Shortcuts
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className={cn(
                    "p-2 rounded-lg",
                    "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
                    "hover:bg-gray-100 dark:hover:bg-gray-800",
                    "transition-colors"
                  )}
                  aria-label="Close"
                >
                  <Cross2Icon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto px-6 py-4">
              {shortcutGroups.map((group) => (
                <div key={group.name} className="mb-8 last:mb-0">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                    {group.name}
                  </h3>
                  <div className="space-y-3">
                    {group.shortcuts.map((shortcut, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className="flex items-center justify-between"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {shortcut.description}
                        </span>
                        <kbd className={cn(
                          "px-3 py-1.5 rounded-lg",
                          "bg-gray-100 dark:bg-gray-800",
                          "border border-gray-200 dark:border-gray-700",
                          "text-sm font-mono text-gray-700 dark:text-gray-300",
                          "shadow-sm"
                        )}>
                          {formatShortcut(shortcut)}
                        </kbd>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Platform note */}
              <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  {navigator.platform.toUpperCase().indexOf('MAC') >= 0
                    ? 'On macOS, use ⌘ instead of Ctrl where applicable'
                    : 'Shortcuts shown are for Windows/Linux'}
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};