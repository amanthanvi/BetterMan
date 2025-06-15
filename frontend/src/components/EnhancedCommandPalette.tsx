"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  BookmarkIcon,
  ReaderIcon,
  HomeIcon,
  GearIcon,
  BarChartIcon,
  ExitIcon,
  EnterIcon,
  Cross2Icon,
  LightningBoltIcon,
  RocketIcon,
  CodeIcon,
  ClockIcon,
  FileTextIcon,
  PersonIcon,
  DownloadIcon,
  Share1Icon,
} from "@radix-ui/react-icons";
import { useNavigate, useLocation } from "react-router-dom";
import { InstantSearchInterface } from "./search/InstantSearchInterface";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/utils/cn";

interface Command {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords: string[];
  category: string;
  shortcut?: string;
}

interface EnhancedCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EnhancedCommandPalette: React.FC<EnhancedCommandPaletteProps> = ({
  isOpen,
  onClose,
}) => {
  const [mode, setMode] = useState<"search" | "commands">("search");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredCommands, setFilteredCommands] = useState<Command[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, currentDocument, addRecentDocument } = useAppStore();

  const commands: Command[] = [
    // Navigation
    {
      id: "home",
      title: "Go to Home",
      subtitle: "Navigate to homepage",
      icon: <HomeIcon className="w-4 h-4" />,
      action: () => {
        navigate("/");
        onClose();
      },
      keywords: ["home", "start", "main"],
      category: "Navigation",
      shortcut: "⌘H",
    },
    {
      id: "search",
      title: "Search Documentation",
      subtitle: "Find man pages and documentation",
      icon: <MagnifyingGlassIcon className="w-4 h-4" />,
      action: () => {
        setMode("search");
      },
      keywords: ["search", "find", "docs", "man", "documentation"],
      category: "Navigation",
      shortcut: "⌘/",
    },
    {
      id: "favorites",
      title: "View Favorites",
      subtitle: "Browse your bookmarked pages",
      icon: <BookmarkIcon className="w-4 h-4" />,
      action: () => {
        navigate("/favorites");
        onClose();
      },
      keywords: ["favorites", "bookmarks", "saved", "starred"],
      category: "Navigation",
      shortcut: "⌘B",
    },
    {
      id: "recent",
      title: "Recent Documents",
      subtitle: "View recently accessed documents",
      icon: <ClockIcon className="w-4 h-4" />,
      action: () => {
        navigate("/recent");
        onClose();
      },
      keywords: ["recent", "history", "accessed", "viewed"],
      category: "Navigation",
      shortcut: "⌘R",
    },
    {
      id: "docs",
      title: "Browse All Documents",
      subtitle: "View all available documentation",
      icon: <ReaderIcon className="w-4 h-4" />,
      action: () => {
        navigate("/docs");
        onClose();
      },
      keywords: ["all", "browse", "documents", "list"],
      category: "Navigation",
    },

    // Current Document Actions (if viewing a document)
    ...(currentDocument
      ? [
          {
            id: "download-pdf",
            title: "Download as PDF",
            subtitle: `Export ${currentDocument.name} to PDF`,
            icon: <DownloadIcon className="w-4 h-4" />,
            action: () => {
              // Trigger PDF download
              window.open(`/api/docs/${currentDocument.id}/download?format=pdf`, "_blank");
              onClose();
            },
            keywords: ["download", "pdf", "export", "save"],
            category: "Document",
            shortcut: "⌘D",
          },
          {
            id: "share",
            title: "Share Document",
            subtitle: `Share link to ${currentDocument.name}`,
            icon: <Share1Icon className="w-4 h-4" />,
            action: () => {
              // Copy link to clipboard
              const url = `${window.location.origin}/docs/${currentDocument.name}/${currentDocument.section}`;
              navigator.clipboard.writeText(url);
              // Show toast notification
              onClose();
            },
            keywords: ["share", "link", "copy", "url"],
            category: "Document",
            shortcut: "⌘S",
          },
          {
            id: "view-raw",
            title: "View Raw Content",
            subtitle: "Show original man page format",
            icon: <CodeIcon className="w-4 h-4" />,
            action: () => {
              // Toggle raw view
              const params = new URLSearchParams(location.search);
              params.set("raw", "true");
              navigate(`${location.pathname}?${params.toString()}`);
              onClose();
            },
            keywords: ["raw", "source", "original", "code"],
            category: "Document",
          },
        ]
      : []),

    // User Actions
    ...(user
      ? [
          {
            id: "profile",
            title: "View Profile",
            subtitle: "Manage your account settings",
            icon: <PersonIcon className="w-4 h-4" />,
            action: () => {
              navigate("/profile");
              onClose();
            },
            keywords: ["profile", "account", "user", "settings"],
            category: "User",
          },
          {
            id: "logout",
            title: "Sign Out",
            subtitle: "Log out of your account",
            icon: <ExitIcon className="w-4 h-4" />,
            action: () => {
              // Handle logout
              onClose();
            },
            keywords: ["logout", "signout", "exit", "leave"],
            category: "User",
          },
        ]
      : [
          {
            id: "login",
            title: "Sign In",
            subtitle: "Log in to your account",
            icon: <EnterIcon className="w-4 h-4" />,
            action: () => {
              navigate("/login");
              onClose();
            },
            keywords: ["login", "signin", "enter", "authenticate"],
            category: "User",
          },
        ]),

    // Settings & Tools
    {
      id: "settings",
      title: "Settings",
      subtitle: "Configure application preferences",
      icon: <GearIcon className="w-4 h-4" />,
      action: () => {
        navigate("/settings");
        onClose();
      },
      keywords: ["settings", "preferences", "config", "options"],
      category: "Settings",
      shortcut: "⌘,",
    },
    {
      id: "analytics",
      title: "Analytics Dashboard",
      subtitle: "View usage statistics and trends",
      icon: <BarChartIcon className="w-4 h-4" />,
      action: () => {
        navigate("/analytics");
        onClose();
      },
      keywords: ["analytics", "stats", "metrics", "dashboard"],
      category: "Tools",
    },
    {
      id: "keyboard-shortcuts",
      title: "Keyboard Shortcuts",
      subtitle: "View all keyboard shortcuts",
      icon: <FileTextIcon className="w-4 h-4" />,
      action: () => {
        // Show keyboard shortcuts modal
        onClose();
      },
      keywords: ["keyboard", "shortcuts", "keys", "hotkeys"],
      category: "Help",
      shortcut: "?",
    },
  ];

  // Filter commands based on query
  useEffect(() => {
    if (mode === "commands") {
      const filtered = commands.filter((cmd) => {
        const searchStr = `${cmd.title} ${cmd.subtitle || ""} ${cmd.keywords.join(" ")}`.toLowerCase();
        return searchStr.includes(query.toLowerCase());
      });
      setFilteredCommands(filtered);
      setSelectedIndex(0);
    }
  }, [query, mode]);

  // Reset on open/close
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setMode("search");
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mode === "commands") {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          }
          break;
        case "Escape":
          e.preventDefault();
          if (query) {
            setQuery("");
          } else {
            onClose();
          }
          break;
      }
    }
  };

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, Command[]>);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Command Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-0 top-[10%] mx-auto max-w-3xl z-50 px-4"
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
              {/* Mode Tabs */}
              <div className="flex items-center border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setMode("search")}
                  className={cn(
                    "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                    mode === "search"
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  )}
                >
                  <LightningBoltIcon className="w-4 h-4 inline mr-2" />
                  Instant Search
                </button>
                <button
                  onClick={() => setMode("commands")}
                  className={cn(
                    "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                    mode === "commands"
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  )}
                >
                  <RocketIcon className="w-4 h-4 inline mr-2" />
                  Commands
                </button>
              </div>

              {/* Content */}
              {mode === "search" ? (
                <div className="p-4">
                  <InstantSearchInterface
                    onClose={onClose}
                    autoFocus
                    placeholder="Search docs, use ! for shortcuts, or ask a question..."
                  />
                </div>
              ) : (
                <>
                  {/* Command Search Input */}
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a command or search..."
                        autoFocus
                        className="w-full pl-10 pr-10 py-3 bg-gray-100 dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {query && (
                        <button
                          onClick={() => setQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <Cross2Icon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Command Results */}
                  <div className="max-h-96 overflow-y-auto">
                    {Object.entries(groupedCommands).map(([category, categoryCommands]) => (
                      <div key={category} className="p-2">
                        <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          {category}
                        </div>
                        {categoryCommands.map((cmd, index) => {
                          const globalIndex = filteredCommands.indexOf(cmd);
                          return (
                            <button
                              key={cmd.id}
                              onClick={cmd.action}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors",
                                "hover:bg-gray-100 dark:hover:bg-gray-700",
                                selectedIndex === globalIndex && "bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500"
                              )}
                            >
                              <div className="flex items-center space-x-3">
                                <div className="text-gray-400 dark:text-gray-500">{cmd.icon}</div>
                                <div>
                                  <div className="font-medium text-sm">{cmd.title}</div>
                                  {cmd.subtitle && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{cmd.subtitle}</div>
                                  )}
                                </div>
                              </div>
                              {cmd.shortcut && (
                                <kbd className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded">
                                  {cmd.shortcut}
                                </kbd>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Empty State */}
                  {filteredCommands.length === 0 && (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                      <p>No commands found</p>
                      <p className="text-sm mt-1">Try a different search term</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};