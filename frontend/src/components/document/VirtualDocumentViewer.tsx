import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import {
  BookmarkIcon,
  Share1Icon,
  DownloadIcon,
  EyeOpenIcon,
  HamburgerMenuIcon,
  CopyIcon as DocumentDuplicateIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/utils/cn";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Document } from "@/types";
import { parseGroffSections } from "@/utils/groffParser";
import { useVirtualScroll } from "@/hooks/useVirtualScroll";
import { useInView } from "react-intersection-observer";

// Lazy load heavy components
const SyntaxHighlighter = lazy(() => 
  import("react-syntax-highlighter").then(mod => ({ default: mod.Prism }))
);

const vscDarkPlus = lazy(() => 
  import("react-syntax-highlighter/dist/esm/styles/prism").then(mod => ({ default: mod.vscDarkPlus }))
);

const vs = lazy(() => 
  import("react-syntax-highlighter/dist/esm/styles/prism").then(mod => ({ default: mod.vs }))
);

interface VirtualDocumentViewerProps {
  document: Document;
  className?: string;
}

interface TableOfContentsItem {
  id: string;
  title: string;
  level: number;
  element?: HTMLElement;
}

interface ContentSection {
  id: string;
  type: 'heading' | 'text' | 'code';
  content: string;
  level?: number;
  language?: string;
  height?: number;
}

// Memoized section component
const SectionRenderer = React.memo<{ 
  section: ContentSection; 
  fontSize: 'sm' | 'base' | 'lg';
  darkMode: boolean;
  showLineNumbers: boolean;
}>(({ section, fontSize, darkMode, showLineNumbers }) => {
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: '100px',
  });

  if (section.type === 'heading') {
    const HeadingTag = `h${section.level || 2}` as keyof JSX.IntrinsicElements;
    return (
      <HeadingTag
        ref={ref}
        id={section.id}
        className={cn(
          "font-bold mb-4 transition-colors duration-200",
          section.level === 2 && "text-xl uppercase tracking-wide text-gray-900 dark:text-gray-100 border-b-2 border-gray-200 dark:border-gray-700 pb-2 mt-10",
          section.level === 3 && "text-lg font-semibold text-gray-800 dark:text-gray-200 mt-8"
        )}
      >
        {section.content}
      </HeadingTag>
    );
  }

  if (section.type === 'code') {
    return (
      <div ref={ref} className="my-4">
        {inView ? (
          <Suspense fallback={<div className="h-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />}>
            <SyntaxHighlighter
              language={section.language || "bash"}
              style={darkMode ? vscDarkPlus : vs}
              customStyle={{
                fontSize: fontSize === "sm" ? "0.875rem" : fontSize === "lg" ? "1.125rem" : "1rem",
                borderRadius: "0.5rem",
              }}
              showLineNumbers={showLineNumbers}
            >
              {section.content}
            </SyntaxHighlighter>
          </Suspense>
        ) : (
          <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        )}
      </div>
    );
  }

  // Parse and style special content
  const parseContent = (content: string) => {
    // Style command options (e.g., -a, --all)
    const optionRegex = /(-{1,2}[a-zA-Z][\w-]*)/g;
    // Style file paths
    const pathRegex = /(\/[\w./]+)/g;
    // Style environment variables
    const envRegex = /(\$[A-Z_]+)/g;
    
    const parts = content.split(/(-{1,2}[a-zA-Z][\w-]*|\/[\w./]+|\$[A-Z_]+)/g);
    
    return parts.map((part, index) => {
      if (optionRegex.test(part)) {
        return <span key={index} className="font-mono font-semibold text-purple-600 dark:text-purple-400">{part}</span>;
      } else if (pathRegex.test(part)) {
        return <code key={index} className="text-blue-600 dark:text-blue-400">{part}</code>;
      } else if (envRegex.test(part)) {
        return <code key={index} className="text-green-600 dark:text-green-400">{part}</code>;
      }
      return part;
    });
  };

  return (
    <p
      ref={ref}
      className={cn(
        "my-3 leading-relaxed text-gray-700 dark:text-gray-300 transition-colors duration-200",
        fontSize === "sm" && "text-sm",
        fontSize === "lg" && "text-lg"
      )}
    >
      {parseContent(section.content)}
    </p>
  );
});

SectionRenderer.displayName = 'SectionRenderer';

export const VirtualDocumentViewer: React.FC<VirtualDocumentViewerProps> = ({
  document: initialDocument,
  className,
}) => {
  const [document] = useState(initialDocument);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showToc, setShowToc] = useState(() => {
    // Persist TOC state in localStorage
    const saved = localStorage.getItem('betterman-toc-visible');
    return saved !== null ? saved === 'true' : true;
  });
  const [tocItems, setTocItems] = useState<TableOfContentsItem[]>([]);
  const [activeSection, setActiveSection] = useState<string>("");
  const [tocInitialized, setTocInitialized] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
  const [scrollProgress, setScrollProgress] = useState(0);
  const [contentSections, setContentSections] = useState<ContentSection[]>([]);

  const contentRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const {
    darkMode,
    isFavorite,
    addFavorite,
    removeFavorite,
    addRecentDoc,
    addToast,
  } = useAppStore();

  // Parse document into sections for virtual scrolling
  const parseDocumentIntoSections = useCallback((doc: Document): ContentSection[] => {
    const sections: ContentSection[] = [];
    let sectionId = 0;

    if (doc.sections && doc.sections.length > 0) {
      const parsedSections = parseGroffSections(doc.sections);
      
      parsedSections.forEach((section) => {
        const headingId = `section-${section.name.toLowerCase().replace(/\s+/g, "-")}`;
        sections.push({
          id: headingId,
          type: 'heading',
          content: section.name,
          level: 2,
        });

        // Parse section content
        const contentLines = section.content.split('\n');
        let inCodeBlock = false;
        let codeBlock: string[] = [];

        contentLines.forEach((line, index) => {
          const isIndented = line.startsWith("    ") || line.startsWith("\t");

          if (isIndented && !inCodeBlock) {
            inCodeBlock = true;
            codeBlock = [line.trim()];
          } else if (isIndented && inCodeBlock) {
            codeBlock.push(line.trim());
          } else if (!isIndented && inCodeBlock) {
            // End of code block
            sections.push({
              id: `code-${sectionId++}`,
              type: 'code',
              content: codeBlock.join('\n'),
              language: 'bash',
            });
            inCodeBlock = false;
            codeBlock = [];

            if (line.trim()) {
              sections.push({
                id: `text-${sectionId++}`,
                type: 'text',
                content: line,
              });
            }
          } else if (!inCodeBlock && line.trim()) {
            sections.push({
              id: `text-${sectionId++}`,
              type: 'text',
              content: line,
            });
          }
        });

        // Handle remaining code block
        if (inCodeBlock && codeBlock.length > 0) {
          sections.push({
            id: `code-${sectionId++}`,
            type: 'code',
            content: codeBlock.join('\n'),
            language: 'bash',
          });
        }

        // Add subsections
        if (section.subsections) {
          section.subsections.forEach((sub: any) => {
            const subId = `${headingId}-sub-${sectionId++}`;
            sections.push({
              id: subId,
              type: 'heading',
              content: sub.name,
              level: 3,
            });

            // Parse subsection content similarly
            const subLines = sub.content.split('\n');
            subLines.forEach((line) => {
              if (line.trim()) {
                sections.push({
                  id: `text-${sectionId++}`,
                  type: 'text',
                  content: line,
                });
              }
            });
          });
        }
      });
    } else if (doc.raw_content) {
      // Fallback to raw content parsing
      const lines = doc.raw_content.split('\n');
      lines.forEach((line) => {
        if (line.trim()) {
          sections.push({
            id: `text-${sectionId++}`,
            type: 'text',
            content: line,
          });
        }
      });
    }

    return sections;
  }, []);

  // Load and parse document content
  useEffect(() => {
    const loadContent = async () => {
      try {
        setLoading(true);
        setError(null);

        // Parse document into sections
        const sections = parseDocumentIntoSections(document);
        setContentSections(sections);

        // Generate TOC from sections
        const tocItems = sections
          .filter(s => s.type === 'heading')
          .map(s => ({
            id: s.id,
            title: s.content,
            level: s.level || 2,
          }));
        setTocItems(tocItems);

        // Add to recent docs
        await addRecentDoc(document);
        
        // Initialize TOC after a delay to prevent flashing
        setTimeout(() => {
          setTocInitialized(true);
        }, 100);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load document");
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [document, addRecentDoc, parseDocumentIntoSections]);

  // Virtual scrolling setup
  const { visibleItems, totalHeight, offsetY, containerRef } = useVirtualScroll(
    contentSections,
    {
      itemHeight: 50, // Estimated average height
      containerHeight: window.innerHeight - 200, // Account for header
      overscan: 5,
      getItemHeight: (index) => {
        const section = contentSections[index];
        if (section.type === 'heading') return section.level === 2 ? 60 : 50;
        if (section.type === 'code') return 150; // Estimated code block height
        return 30; // Text paragraph height
      },
    }
  );

  // Intersection observer for active section
  useEffect(() => {
    if (tocItems.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-20% 0px -70% 0px",
      }
    );

    // Observe heading elements
    tocItems.forEach((item) => {
      const element = window.document.getElementById(item.id);
      if (element) {
        observerRef.current?.observe(element);
      }
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [tocItems]);

  // Debounced scroll progress tracking
  useEffect(() => {
    let rafId: number;
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      
      rafId = requestAnimationFrame(() => {
        const scrollTop = window.pageYOffset || window.document.documentElement.scrollTop;
        const scrollHeight = window.document.documentElement.scrollHeight - window.document.documentElement.clientHeight;
        const progress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
        setScrollProgress(progress);
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Optimized scroll to section
  const scrollToSection = useCallback((id: string) => {
    const element = window.document.getElementById(id);
    if (element) {
      const headerOffset = 140;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  }, []);

  // Memoized action handlers
  const toggleFavorite = useCallback(() => {
    if (!document.name) {
      addToast('Cannot favorite this document - missing name', 'error');
      return;
    }
    const docKey = `${document.name}.${document.section}`;
    if (isFavorite(docKey)) {
      removeFavorite(docKey);
      addToast(`Removed ${document.name} from favorites`, 'info');
    } else {
      addFavorite(docKey);
      addToast(`Added ${document.name} to favorites`, 'success');
    }
  }, [document, isFavorite, addFavorite, removeFavorite, addToast]);

  const copyContent = useCallback(async () => {
    try {
      const fullContent = contentSections.map(s => s.content).join('\n');
      await navigator.clipboard.writeText(fullContent);
      addToast('Content copied to clipboard', 'success');
    } catch (err) {
      console.error("Failed to copy content:", err);
      addToast('Failed to copy content', 'error');
    }
  }, [contentSections, addToast]);

  const printDocument = useCallback(() => {
    window.print();
  }, []);

  const shareDocument = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: document.title,
          text: document.summary,
          url: window.location.href,
        });
      } catch (err) {
        console.error("Failed to share:", err);
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      addToast('Link copied to clipboard', 'success');
    }
  }, [document, addToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className={cn("relative bg-white dark:bg-gray-900", className)}>
      {/* Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-800 z-40">
        <motion.div
          className="h-full bg-blue-500"
          style={{ 
            transformOrigin: "0%",
            scaleX: scrollProgress
          }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Table of Contents */}
      {tocItems.length > 0 && showToc && (
        <aside
          className="document-toc fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto z-20"
            >
              <div className="sticky top-0 bg-gray-50 dark:bg-gray-800 p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  Table of Contents
                </h3>
              </div>
              <nav className="p-4 space-y-1">
                {tocItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    className={cn(
                      "block w-full text-left text-sm py-2 px-3 rounded-md transition-all duration-200",
                      "text-gray-700 dark:text-gray-300",
                      "hover:bg-gray-200 dark:hover:bg-gray-700",
                      item.id === activeSection &&
                        "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium",
                      item.level > 2 && "ml-4 text-xs",
                      item.level > 3 && "ml-8"
                    )}
                  >
                    {item.title}
                  </button>
                ))}
              </nav>
        </aside>
      )}

      {/* Main Content */}
      <div className={cn("flex-1 bg-white dark:bg-gray-900 transition-all duration-300", showToc && tocItems.length > 0 && "ml-64")}>
        {/* Document Header */}
        <header className="document-header sticky top-1 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-mono">
                {document.title}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {document.summary}
              </p>
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                {document.section && document.section !== "json" && (
                  <>
                    <span>Section {document.section}</span>
                    <span>•</span>
                  </>
                )}
                <span>{document.doc_set}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* View options */}
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setFontSize(
                      fontSize === "sm" ? "base" : fontSize === "base" ? "lg" : "sm"
                    )
                  }
                  aria-label="Change font size"
                >
                  <span className={cn(
                    "font-bold",
                    fontSize === "sm" && "text-xs",
                    fontSize === "base" && "text-sm",
                    fontSize === "lg" && "text-base"
                  )}>
                    A
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLineNumbers(!showLineNumbers)}
                  aria-label="Toggle line numbers"
                >
                  <EyeOpenIcon className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newValue = !showToc;
                    setShowToc(newValue);
                    localStorage.setItem('betterman-toc-visible', String(newValue));
                  }}
                  aria-label="Toggle table of contents"
                >
                  <HamburgerMenuIcon className="w-4 h-4" />
                </Button>
              </div>

              {/* Actions */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFavorite}
                className={cn(
                  document.name && isFavorite(`${document.name}.${document.section}`)
                    ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                    : "text-gray-600 dark:text-gray-400"
                )}
                aria-label="Toggle favorite"
              >
                <BookmarkIcon
                  className={cn(
                    "w-4 h-4",
                    document.name && isFavorite(`${document.name}.${document.section}`) &&
                      "fill-current"
                  )}
                />
              </Button>

              <Button variant="ghost" size="sm" onClick={copyContent} aria-label="Copy content">
                <DocumentDuplicateIcon className="w-4 h-4" />
              </Button>

              <Button variant="ghost" size="sm" onClick={shareDocument} aria-label="Share document">
                <Share1Icon className="w-4 h-4" />
              </Button>

              <Button variant="ghost" size="sm" onClick={printDocument} aria-label="Print document">
                <DownloadIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Virtual Scrolling Container */}
        <main className="p-6 pt-32">
          <div
            ref={containerRef}
            className="max-w-4xl mx-auto relative"
            style={{ height: `${totalHeight}px` }}
          >
            <div
              className="absolute top-0 left-0 right-0"
              style={{ transform: `translateY(${offsetY}px)` }}
            >
              {visibleItems.map((section) => (
                <SectionRenderer
                  key={section.id}
                  section={section}
                  fontSize={fontSize}
                  darkMode={darkMode}
                  showLineNumbers={showLineNumbers}
                />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};