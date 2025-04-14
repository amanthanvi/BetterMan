// frontend/src/components/DocumentViewer.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

const DocumentViewer = () => {
  const { docSet, docId, id } = useParams(); // Support both URL patterns
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tableOfContents, setTableOfContents] = useState([]);
  const [activeSection, setActiveSection] = useState(null);
  const contentRef = useRef(null);
  const navigate = useNavigate();

  // Fetch document content
  useEffect(() => {
    const fetchDocument = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const documentId = id || docId; // Use either id or docId depending on which route pattern is used
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        
        // Fetch document details
        const response = await fetch(`${apiUrl}/api/docs/${documentId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch document: ${response.status}`);
        }
        
        const data = await response.json();
        setDocument(data);
        
        // Generate table of contents from sections
        if (data.sections && data.sections.length > 0) {
          const toc = generateTableOfContents(data.sections);
          setTableOfContents(toc);
        }
      } catch (err) {
        console.error('Error fetching document:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    if (id || (docSet && docId)) {
      fetchDocument();
    }
  }, [docSet, docId, id]);

  // Generate table of contents from sections
  const generateTableOfContents = (sections) => {
    const toc = [];
    
    sections.forEach((section, sectionIndex) => {
      toc.push({
        id: `section-${sectionIndex}`,
        name: section.name,
        level: 1
      });
      
      if (section.subsections && section.subsections.length > 0) {
        section.subsections.forEach((subsection, subsectionIndex) => {
          toc.push({
            id: `section-${sectionIndex}-subsection-${subsectionIndex}`,
            name: subsection.name,
            level: 2
          });
        });
      }
    });
    
    return toc;
  };

  // Save to recently viewed
  useEffect(() => {
    if (document) {
      try {
        const recentlyViewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        
        // Check if already in recently viewed
        const existingIndex = recentlyViewed.findIndex(item => 
          item.id === document.id || item.name === document.name
        );
        
        if (existingIndex !== -1) {
          // Remove from current position
          recentlyViewed.splice(existingIndex, 1);
        }
        
        // Add to beginning of array
        recentlyViewed.unshift({
          id: document.id,
          name: document.name,
          title: document.title,
          doc_set: docSet || 'linux',
          summary: document.summary,
          timestamp: new Date().toISOString()
        });
        
        // Limit to 5 items
        const limitedRecent = recentlyViewed.slice(0, 5);
        
        // Save back to localStorage
        localStorage.setItem('recentlyViewed', JSON.stringify(limitedRecent));
      } catch (error) {
        console.error('Error updating recently viewed:', error);
      }
    }
  }, [document, docSet]);

  // Handle scroll to update active section in table of contents
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current || tableOfContents.length === 0) return;
      
      const headerElements = contentRef.current.querySelectorAll('h1, h2, h3');
      const headerPositions = Array.from(headerElements).map(header => ({
        id: header.id,
        position: header.getBoundingClientRect().top
      }));
      
      // Find the header that is currently at the top of the viewport
      const currentHeader = headerPositions.find(header => header.position >= 0) || headerPositions[0];
      
      if (currentHeader && currentHeader.id !== activeSection) {
        setActiveSection(currentHeader.id);
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [tableOfContents, activeSection]);

  // Navigation between related documents
  const navigateToRelated = (relatedName) => {
    // docSet is optional and defaults to 'linux'
    const targetDocSet = docSet || 'linux';
    navigate(`/docs/${relatedName}`);
  };

  // Custom renderers for ReactMarkdown
  const components = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          style={atomDark}
          language={match[1]}
          PreTag="div"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    // Add custom link handling for internal document references
    a({ node, href, children, ...props }) {
      const isInternal = href.startsWith('#') || href.includes('/docs/');
      
      if (isInternal && !href.startsWith('#')) {
        const parts = href.split('/');
        const targetDocId = parts.pop();
        
        return (
          <button
            onClick={() => navigateToRelated(targetDocId)}
            className="text-indigo-600 hover:text-indigo-900 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
            {...props}
          >
            {children}
          </button>
        );
      }
      
      return (
        <a
          href={href}
          target={isInternal ? '_self' : '_blank'}
          rel={!isInternal ? 'noopener noreferrer' : undefined}
          className={isInternal
            ? 'text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300'
            : 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'}
          {...props}
        >
          {children}
        </a>
      );
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900 border-l-4 border-red-500 p-4 my-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-500 dark:text-red-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-red-700 dark:text-red-300">
              Error loading document: {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">No document selected</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 bg-white dark:bg-gray-900">
      <div className="flex flex-col md:flex-row">
        {/* Table of Contents - Sidebar */}
        <div className="md:w-64 flex-shrink-0 pb-4 md:pb-0">
          <div className="sticky top-20">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Table of Contents</h2>
            {tableOfContents && tableOfContents.length > 0 ? (
              <nav className="space-y-1">
                {tableOfContents.map((header) => (
                  <a
                    key={header.id}
                    href={`#${header.id}`}
                    className={`
                      block text-sm py-2 ${header.level === 2 ? 'pl-4' : ''} 
                      ${activeSection === header.id 
                        ? 'text-indigo-600 font-medium dark:text-indigo-400' 
                        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300'
                      }
                    `}
                  >
                    {header.name}
                  </a>
                ))}
              </nav>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                No table of contents available
              </div>
            )}
          </div>
        </div>
        
        {/* Main Content */}
        <main className="flex-1 min-w-0 md:pl-8" ref={contentRef}>
          <div className="mb-6">
            <h1 id="document-title" className="text-3xl font-bold text-gray-900 dark:text-white">{document.title}</h1>
            {document.section && (
              <p className="text-gray-500 dark:text-gray-400 mt-1">Section: {document.section}</p>
            )}
            {document.summary && (
              <p className="mt-2 text-lg text-gray-700 dark:text-gray-300">{document.summary}</p>
            )}
          </div>
          
          {/* Document Sections */}
          {document.sections && document.sections.length > 0 && (
            <div className="prose prose-indigo max-w-none dark:prose-invert">
              {document.sections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="mb-8">
                  <h2 id={`section-${sectionIndex}`} className="text-2xl font-bold text-gray-900 dark:text-white mt-8">
                    {section.name}
                  </h2>
                  <div className="mt-4">
                    <ReactMarkdown
                      rehypePlugins={[rehypeSlug]}
                      remarkPlugins={[remarkGfm]}
                      components={components}
                    >
                      {section.content}
                    </ReactMarkdown>
                  </div>
                  
                  {section.subsections && section.subsections.map((subsection, subsectionIndex) => (
                    <div key={subsectionIndex} className="mt-6 ml-4">
                      <h3 id={`section-${sectionIndex}-subsection-${subsectionIndex}`} className="text-xl font-semibold text-gray-900 dark:text-white">
                        {subsection.name}
                      </h3>
                      <div className="mt-2">
                        <ReactMarkdown
                          rehypePlugins={[rehypeSlug]}
                          remarkPlugins={[remarkGfm]}
                          components={components}
                        >
                          {subsection.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          
          {/* Related Documents */}
          {document.related && document.related.length > 0 && (
            <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Related Documents</h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {document.related.map((relatedName, index) => (
                  <li key={index}>
                    <button
                      onClick={() => navigateToRelated(relatedName)}
                      className="block w-full p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                    >
                      <h3 className="font-medium text-gray-900 dark:text-white">{relatedName}</h3>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default DocumentViewer;