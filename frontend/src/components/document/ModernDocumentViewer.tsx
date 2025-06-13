import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookmarkIcon,
  Share1Icon,
  DownloadIcon,
  EyeOpenIcon,
  HamburgerMenuIcon,
  CopyIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  Cross2Icon,
  ArrowLeftIcon,
  ArrowRightIcon,
  TextIcon,
  CodeIcon,
  LightningBoltIcon,
  RocketIcon,
  StarIcon,
  HeartIcon,
  InfoCircledIcon,
  ExclamationTriangleIcon,
  TargetIcon,
  LayersIcon,
  CubeIcon,
  ClockIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/utils/cn";
import type { Document } from "@/types";
import { documentAPI } from "@/services/api";

// Import our enhanced content parser
import { ModernContentParser } from "./ModernContentParser";

interface DocumentViewerProps {
  document: Document;
  className?: string;
}

interface TableOfContentsItem {
  id: string;
  title: string;
  level: number;
  icon?: React.ReactNode;
  children?: TableOfContentsItem[];
  isActive?: boolean;
  isExpanded?: boolean;
}

interface DocumentSection {
  id: string;
  title: string;
  content: string;
  level: number;
  type?: "header" | "synopsis" | "description" | "options" | "examples" | "see-also" | "notes" | "bugs" | "author" | "copyright";
}

// Section icons mapping
const sectionIcons: Record<string, React.ReactNode> = {
  header: <LayersIcon className="w-4 h-4" />,
  name: <TargetIcon className="w-4 h-4" />,
  synopsis: <CodeIcon className="w-4 h-4" />,
  description: <TextIcon className="w-4 h-4" />,
  options: <CubeIcon className="w-4 h-4" />,
  examples: <RocketIcon className="w-4 h-4" />,
  "exit status": <InfoCircledIcon className="w-4 h-4" />,
  environment: <LayersIcon className="w-4 h-4" />,
  notes: <InfoCircledIcon className="w-4 h-4" />,
  bugs: <ExclamationTriangleIcon className="w-4 h-4" />,
  "see also": <LightningBoltIcon className="w-4 h-4" />,
  author: <HeartIcon className="w-4 h-4" />,
  copyright: <StarIcon className="w-4 h-4" />,
};

export const ModernDocumentViewer: React.FC<DocumentViewerProps> = ({
  document: doc,
  className,
}) => {
  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [tocItems, setTocItems] = useState<TableOfContentsItem[]>([]);
  const [activeSection, setActiveSection] = useState<string>("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [tocSearch, setTocSearch] = useState("");
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
  const [copied, setCopied] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [viewMode, setViewMode] = useState<"comfortable" | "compact" | "spacious">("comfortable");
  const [showReadTime, setShowReadTime] = useState(true);
  const [readingProgress, setReadingProgress] = useState(0);

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // App store
  const {
    darkMode,
    isFavorite,
    addFavorite,
    removeFavorite,
    addRecentDoc,
    addToast,
    documentTocOpen: showToc,
    setDocumentTocOpen: setShowToc,
  } = useAppStore();

  const docKey = `${doc.name}.${doc.section}`;
  const isDocFavorite = isFavorite(docKey);

  // Content parser instance
  const contentParser = useMemo(() => new ModernContentParser(), []);

  // Parse document content
  useEffect(() => {
    const parseContent = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!doc.raw_content && !doc.content && (!doc.sections || doc.sections.length === 0)) {
          setError("No content available for this document.");
          return;
        }

        // Parse the content using our enhanced parser
        const parsedSections = contentParser.parseDocument(doc);
        setSections(parsedSections);

        // Generate TOC from parsed sections
        const tocItems = parsedSections.map((section) => ({
          id: section.id,
          title: section.title,
          level: section.level,
          icon: sectionIcons[section.title.toLowerCase()] || <TextIcon className="w-4 h-4" />,
          children: [],
          isExpanded: true,
        }));

        setTocItems(tocItems);
        setExpandedSections(new Set(tocItems.map(item => item.id)));

        // Add to recent docs
        addRecentDoc(doc);
      } catch (err) {
        console.error("Error parsing document:", err);
        setError(err instanceof Error ? err.message : "Failed to parse document");
      } finally {
        setLoading(false);
      }
    };

    parseContent();
  }, [doc, contentParser, addRecentDoc]);

  // Set up intersection observer for section tracking
  useEffect(() => {
    if (typeof window === 'undefined' || !sections.length) return;

    const observerOptions = {
      root: scrollContainerRef.current,
      rootMargin: "-20% 0px -60% 0px",
      threshold: [0, 0.25, 0.5, 0.75, 1],
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.25) {
          setActiveSection(entry.target.id);
        }
      });
    }, observerOptions);

    // Observe all sections
    sections.forEach((section) => {
      const element = window.document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    observerRef.current = observer;

    return () => observer.disconnect();
  }, [sections]);

  // Scroll progress tracking
  useEffect(() => {
    const handleScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      
      setScrollProgress(progress);
      setReadingProgress(progress);
      setShowScrollTop(scrollTop > 500);
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll, { passive: true });
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "k":
            e.preventDefault();
            setShowToc(!showToc);
            break;
          case "b":
            e.preventDefault();
            handleFavoriteToggle();
            break;
          case "+":
          case "=":
            e.preventDefault();
            handleFontSizeChange(fontSize === "sm" ? "base" : "lg");
            break;
          case "-":
            e.preventDefault();
            handleFontSizeChange(fontSize === "lg" ? "base" : "sm");
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [showToc, fontSize]);

  // Handlers
  const handleSectionClick = (sectionId: string) => {
    const element = window.document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleFavoriteToggle = () => {
    if (isDocFavorite) {
      removeFavorite(docKey);
      addToast(`Removed ${doc.name} from favorites`, "info");
    } else {
      addFavorite(docKey);
      addToast(`Added ${doc.name} to favorites`, "success");
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: doc.title,
          text: doc.summary,
          url,
        });
        addToast("Shared successfully!", "success");
      } catch (err) {
        // User cancelled share
      }
    } else {
      // Fallback to clipboard
      await navigator.clipboard.writeText(url);
      setCopied(true);
      addToast("Link copied to clipboard!", "success");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await documentAPI.downloadDocument(doc.name, String(doc.section));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${doc.name}.${doc.section}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      addToast("Document downloaded!", "success");
    } catch (err) {
      addToast("Failed to download document", "error");
    }
  };

  const handleFontSizeChange = (size: "sm" | "base" | "lg") => {
    setFontSize(size);
    addToast(`Font size changed to ${size === "sm" ? "small" : size === "lg" ? "large" : "medium"}`, "info");
  };

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleSectionExpansion = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  // Filter TOC items based on search
  const filteredTocItems = useMemo(() => {
    if (!tocSearch) return tocItems;
    
    const searchLower = tocSearch.toLowerCase();
    return tocItems.filter(item => 
      item.title.toLowerCase().includes(searchLower)
    );
  }, [tocItems, tocSearch]);

  // Calculate read time
  const readTime = useMemo(() => {
    const text = sections.map(s => s.content).join(" ");
    const words = text.split(/\s+/).length;
    const minutes = Math.ceil(words / 200);
    return minutes;
  }, [sections]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full"
              style={{ borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%" }}
            />
          </div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading documentation...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md mx-auto p-8"
        >
          <ExclamationTriangleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Error Loading Document
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("relative min-h-screen bg-gray-50 dark:bg-gray-950", className)}>
      {/* Progress bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 z-50 origin-left"
        style={{ scaleX: scrollProgress / 100 }}
      />

      {/* Table of Contents Sidebar */}
      <AnimatePresence>
        {showToc && (
          <motion.aside
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-16 bottom-0 w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-2xl z-40 flex flex-col"
          >
            {/* TOC Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Table of Contents
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowToc(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <Cross2Icon className="w-4 h-4" />
                </Button>
              </div>
              
              {/* TOC Search */}
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search sections..."
                  value={tocSearch}
                  onChange={(e) => setTocSearch(e.target.value)}
                  className="pl-9 pr-3 py-2 w-full text-sm"
                />
              </div>

              {/* Read time badge */}
              {showReadTime && (
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    <ClockIcon className="w-3 h-3 mr-1" />
                    {readTime} min read
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {readingProgress.toFixed(0)}% complete
                  </Badge>
                </div>
              )}
            </div>

            {/* TOC Items */}
            <div className="flex-1 overflow-y-auto p-4">
              <AnimatePresence>
                {filteredTocItems.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <button
                      onClick={() => handleSectionClick(item.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-lg transition-all duration-200 group flex items-center gap-3",
                        "hover:bg-gray-100 dark:hover:bg-gray-800",
                        activeSection === item.id
                          ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium"
                          : "text-gray-700 dark:text-gray-300"
                      )}
                    >
                      <span className={cn(
                        "transition-transform duration-200",
                        activeSection === item.id && "scale-110"
                      )}>
                        {item.icon}
                      </span>
                      <span className="flex-1">{item.title}</span>
                      {activeSection === item.id && (
                        <motion.div
                          layoutId="activeIndicator"
                          className="w-1 h-4 bg-blue-500 rounded-full"
                        />
                      )}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div
        ref={scrollContainerRef}
        className={cn(
          "h-screen overflow-y-auto transition-all duration-300",
          showToc ? "pl-80" : "pl-0"
        )}
      >
        {/* Document Header */}
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowToc(!showToc)}
                  className="lg:hidden"
                >
                  <HamburgerMenuIcon className="w-5 h-5" />
                </Button>
                
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {doc.title || doc.name}
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {doc.summary}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* View Mode */}
                <div className="hidden lg:flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                  {(["comfortable", "compact", "spacious"] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant={viewMode === mode ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode(mode)}
                      className="capitalize"
                    >
                      {mode}
                    </Button>
                  ))}
                </div>

                {/* Font Size */}
                <div className="hidden md:flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleFontSizeChange("sm")}
                    className={fontSize === "sm" ? "bg-gray-200 dark:bg-gray-700" : ""}
                  >
                    <TextIcon className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleFontSizeChange("base")}
                    className={fontSize === "base" ? "bg-gray-200 dark:bg-gray-700" : ""}
                  >
                    <TextIcon className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleFontSizeChange("lg")}
                    className={fontSize === "lg" ? "bg-gray-200 dark:bg-gray-700" : ""}
                  >
                    <TextIcon className="w-5 h-5" />
                  </Button>
                </div>

                {/* Actions */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFavoriteToggle}
                  className={isDocFavorite ? "text-yellow-500" : ""}
                >
                  <BookmarkIcon className={cn("w-5 h-5", isDocFavorite && "fill-current")} />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleShare}>
                  {copied ? <CheckIcon className="w-5 h-5" /> : <Share1Icon className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDownload}>
                  <DownloadIcon className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Document Content */}
        <main
          ref={contentRef}
          className={cn(
            "max-w-6xl mx-auto px-6 py-8",
            fontSize === "sm" && "text-sm",
            fontSize === "lg" && "text-lg",
            viewMode === "compact" && "space-y-4",
            viewMode === "comfortable" && "space-y-6",
            viewMode === "spacious" && "space-y-8"
          )}
        >
          <AnimatePresence>
            {sections.map((section, index) => (
              <motion.section
                key={section.id}
                id={section.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  "scroll-mt-24",
                  viewMode === "compact" && "py-4",
                  viewMode === "comfortable" && "py-6",
                  viewMode === "spacious" && "py-8"
                )}
              >
                {/* Render section content using the content parser */}
                {contentParser.renderSection(section, {
                  darkMode,
                  fontSize,
                  viewMode,
                  onCopy: (text: string) => {
                    navigator.clipboard.writeText(text);
                    addToast("Copied to clipboard!", "success");
                  },
                })}
              </motion.section>
            ))}
          </AnimatePresence>
        </main>

        {/* Scroll to top button */}
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={scrollToTop}
              className="fixed bottom-8 right-8 p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 z-30"
            >
              <ArrowRightIcon className="w-5 h-5 transform -rotate-90" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};