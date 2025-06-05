import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bookmark, 
  BookmarkCheck, 
  Copy, 
  Check, 
  Share2, 
  Download,
  ChevronRight,
  Menu,
  X,
  Hash
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/utils/cn';
import { api } from '@/services/api';
import { useAppStore } from '@/stores/appStore';

interface Section {
  id: number;
  name: string;
  content: string;
  order: number;
  subsections?: Subsection[];
}

interface Subsection {
  id: number;
  name: string;
  content: string;
  order: number;
}

interface DocumentViewerProps {
  document: {
    id: number;
    name: string;
    title: string;
    section: string;
    summary: string;
    content: string;
    sections?: Section[];
    related_documents?: Array<{ name: string; section: string }>;
  };
}

export const EnhancedDocumentViewer: React.FC<DocumentViewerProps> = ({ document }) => {
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteId, setFavoriteId] = useState<number | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('');
  const [showMobileToc, setShowMobileToc] = useState(false);
  
  const contentRef = useRef<HTMLDivElement>(null);
  const { user } = useAppStore();

  // Check if document is favorited
  useEffect(() => {
    if (user) {
      checkFavoriteStatus();
    }
  }, [document.id, user]);

  // Set up intersection observer for section highlighting
  useEffect(() => {
    if (!document.sections || document.sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    const sections = contentRef.current?.querySelectorAll('section[id]');
    sections?.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [document.sections]);

  const checkFavoriteStatus = async () => {
    try {
      const response = await api.get(`/user/favorites/check/${document.id}`);
      setIsFavorite(response.data.is_favorite);
      setFavoriteId(response.data.favorite_id);
    } catch (error) {
      console.error('Failed to check favorite status:', error);
    }
  };

  const toggleFavorite = async () => {
    if (!user) {
      showToastMessage('Please sign in to save favorites');
      return;
    }

    try {
      if (isFavorite && favoriteId) {
        await api.delete(`/user/favorites/${favoriteId}`);
        setIsFavorite(false);
        setFavoriteId(null);
        showToastMessage('Removed from favorites');
      } else {
        const response = await api.post('/user/favorites', {
          document_id: document.id
        });
        setIsFavorite(true);
        setFavoriteId(response.data.id);
        showToastMessage('Added to favorites');
      }
    } catch (error) {
      showToastMessage('Failed to update favorites');
    }
  };

  const copyToClipboard = async (text: string, sectionId?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (sectionId) {
        setCopiedSection(sectionId);
        setTimeout(() => setCopiedSection(null), 2000);
      }
      showToastMessage('Copied to clipboard');
    } catch (error) {
      showToastMessage('Failed to copy');
    }
  };

  const shareDocument = async () => {
    const url = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: document.title,
          text: document.summary,
          url: url
        });
      } catch (error) {
        console.error('Share failed:', error);
      }
    } else {
      await copyToClipboard(url);
    }
  };

  const downloadDocument = () => {
    // Create a blob with the document content
    const content = `# ${document.title}\n\n${document.summary}\n\n${document.content}`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${document.name}.md`;
    a.click();
    
    URL.revokeObjectURL(url);
    showToastMessage('Document downloaded');
  };

  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setShowMobileToc(false);
    }
  };

  const sectionBadgeColors: Record<string, string> = {
    '1': 'primary',
    '2': 'success',
    '3': 'info',
    '4': 'warning',
    '5': 'danger',
    '6': 'default',
    '7': 'default',
    '8': 'primary',
  } as const;

  return (
    <div className="relative">
      {/* Mobile TOC Toggle */}
      <div className="lg:hidden fixed bottom-6 right-6 z-40">
        <Button
          size="icon"
          onClick={() => setShowMobileToc(!showMobileToc)}
          className="shadow-lg"
          aria-label="Toggle table of contents"
        >
          {showMobileToc ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      <div className="flex gap-8">
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <Card variant="default" className="mb-6">
            {/* Document Header */}
            <div className="border-b border-gray-200 dark:border-gray-700 pb-6 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {document.name}
                    </h1>
                    <Badge 
                      variant={sectionBadgeColors[document.section] as any || 'default'}
                      size="lg"
                    >
                      Section {document.section}
                    </Badge>
                  </div>
                  <p className="text-lg text-gray-600 dark:text-gray-400">
                    {document.title}
                  </p>
                  {document.summary && (
                    <p className="mt-3 text-gray-700 dark:text-gray-300">
                      {document.summary}
                    </p>
                  )}
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={toggleFavorite}
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {isFavorite ? (
                      <BookmarkCheck className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Bookmark className="w-5 h-5" />
                    )}
                  </Button>
                  
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={shareDocument}
                    aria-label="Share document"
                  >
                    <Share2 className="w-5 h-5" />
                  </Button>
                  
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={downloadDocument}
                    aria-label="Download document"
                  >
                    <Download className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Document Content */}
            <CardContent ref={contentRef} className="prose prose-gray dark:prose-invert max-w-none">
              {document.sections && document.sections.length > 0 ? (
                document.sections.map((section) => (
                  <section key={section.id} id={`section-${section.id}`} className="mb-8">
                    <div className="flex items-center justify-between group mb-4">
                      <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Hash className="w-5 h-5 text-gray-400" />
                        {section.name}
                      </h2>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(section.content, `section-${section.id}`)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {copiedSection === `section-${section.id}` ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    
                    <div 
                      className="whitespace-pre-wrap font-mono text-sm"
                      dangerouslySetInnerHTML={{ __html: section.content }}
                    />
                    
                    {section.subsections && section.subsections.map((subsection) => (
                      <div key={subsection.id} id={`subsection-${subsection.id}`} className="mt-6 ml-6">
                        <h3 className="text-lg font-medium mb-2">{subsection.name}</h3>
                        <div 
                          className="whitespace-pre-wrap font-mono text-sm"
                          dangerouslySetInnerHTML={{ __html: subsection.content }}
                        />
                      </div>
                    ))}
                  </section>
                ))
              ) : (
                <div 
                  className="whitespace-pre-wrap font-mono text-sm"
                  dangerouslySetInnerHTML={{ __html: document.content }}
                />
              )}
              
              {/* Related Documents */}
              {document.related_documents && document.related_documents.length > 0 && (
                <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
                  <h2 className="text-xl font-semibold mb-4">See Also</h2>
                  <div className="flex flex-wrap gap-2">
                    {document.related_documents.map((related, index) => (
                      <a
                        key={index}
                        href={`/docs/${related.name}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        {related.name}
                        {related.section && (
                          <span className="text-gray-500 dark:text-gray-400">
                            ({related.section})
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Desktop Table of Contents */}
        {document.sections && document.sections.length > 0 && (
          <aside className="hidden lg:block w-64 shrink-0">
            <Card variant="default" className="sticky top-6">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                On this page
              </h3>
              <nav aria-label="Table of contents">
                <ul className="space-y-2">
                  {document.sections.map((section) => (
                    <li key={section.id}>
                      <button
                        onClick={() => scrollToSection(`section-${section.id}`)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                          activeSection === `section-${section.id}`
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                            : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                        )}
                      >
                        {section.name}
                      </button>
                      
                      {section.subsections && (
                        <ul className="ml-4 mt-1 space-y-1">
                          {section.subsections.map((subsection) => (
                            <li key={subsection.id}>
                              <button
                                onClick={() => scrollToSection(`subsection-${subsection.id}`)}
                                className={cn(
                                  "w-full text-left px-3 py-1 rounded text-xs transition-colors flex items-center gap-1",
                                  activeSection === `subsection-${subsection.id}`
                                    ? "text-blue-700 dark:text-blue-400"
                                    : "text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
                                )}
                              >
                                <ChevronRight className="w-3 h-3" />
                                {subsection.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            </Card>
          </aside>
        )}
      </div>

      {/* Mobile Table of Contents */}
      <AnimatePresence>
        {showMobileToc && document.sections && document.sections.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="lg:hidden fixed inset-0 z-50 bg-black/50"
            onClick={() => setShowMobileToc(false)}
          >
            <motion.div
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl p-6 max-h-[70vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-semibold text-lg mb-4">Table of Contents</h3>
              <nav>
                <ul className="space-y-3">
                  {document.sections.map((section) => (
                    <li key={section.id}>
                      <button
                        onClick={() => scrollToSection(`section-${section.id}`)}
                        className="w-full text-left px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-800"
                      >
                        {section.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <Toast message={toastMessage} onClose={() => setShowToast(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};