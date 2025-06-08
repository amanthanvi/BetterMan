import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/utils/cn';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  darkMode?: boolean;
  fontSize?: 'sm' | 'base' | 'lg';
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className,
  darkMode = false,
  fontSize = 'base'
}) => {
  const fontSizeClasses = {
    sm: 'prose-sm',
    base: 'prose-base',
    lg: 'prose-lg'
  };

  return (
    <div className={cn(
      'prose dark:prose-invert max-w-none',
      fontSizeClasses[fontSize],
      'prose-headings:font-semibold',
      'prose-h1:text-3xl prose-h1:mb-6',
      'prose-h2:text-2xl prose-h2:mb-4 prose-h2:mt-8',
      'prose-h3:text-xl prose-h3:mb-3 prose-h3:mt-6',
      'prose-p:leading-relaxed prose-p:mb-4',
      'prose-code:bg-gray-100 dark:prose-code:bg-gray-800',
      'prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded',
      'prose-code:text-sm prose-code:font-mono',
      'prose-pre:bg-transparent prose-pre:p-0',
      'prose-strong:font-semibold prose-strong:text-gray-900 dark:prose-strong:text-gray-100',
      'prose-em:italic',
      'prose-ul:list-disc prose-ul:pl-6',
      'prose-ol:list-decimal prose-ol:pl-6',
      'prose-li:mb-1',
      'prose-blockquote:border-l-4 prose-blockquote:border-blue-500',
      'prose-blockquote:pl-4 prose-blockquote:italic',
      'prose-a:text-blue-600 dark:prose-a:text-blue-400',
      'prose-a:no-underline hover:prose-a:underline',
      className
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                style={darkMode ? vscDarkPlus : vs}
                language={match[1]}
                PreTag="div"
                className="rounded-lg overflow-hidden"
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
          // Custom rendering for definition lists (common in man pages)
          p({ children, ...props }) {
            const text = String(children);
            // Check if this looks like a parameter definition
            if (text.match(/^(-{1,2}\w[\w-]*)(.*)/)) {
              const match = text.match(/^(-{1,2}\w[\w-]*)(.*)/);
              if (match) {
                const [, param, desc] = match;
                return (
                  <div className="flex flex-wrap gap-2 mb-3 items-start">
                    <code className="inline-block px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono text-blue-600 dark:text-blue-400 flex-shrink-0">
                      {param}
                    </code>
                    <span className="text-gray-700 dark:text-gray-300 flex-1">
                      {desc.trim()}
                    </span>
                  </div>
                );
              }
            }
            return <p {...props}>{children}</p>;
          },
          // Custom heading rendering with better spacing
          h1: ({ children, ...props }) => (
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6 mt-8 first:mt-0" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4 mt-8 pb-2 border-b border-gray-200 dark:border-gray-700" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3 mt-6" {...props}>
              {children}
            </h3>
          ),
          // Better list rendering
          ul: ({ children, ...props }) => (
            <ul className="list-disc pl-6 mb-4 space-y-1" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal pl-6 mb-4 space-y-1" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="text-gray-700 dark:text-gray-300 leading-relaxed" {...props}>
              {children}
            </li>
          ),
          // Better blockquote styling
          blockquote: ({ children, ...props }) => (
            <blockquote className="border-l-4 border-blue-500 pl-4 my-4 italic text-gray-700 dark:text-gray-300" {...props}>
              {children}
            </blockquote>
          ),
          // Table styling
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-6">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-gray-50 dark:bg-gray-800" {...props}>
              {children}
            </thead>
          ),
          th: ({ children, ...props }) => (
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300" {...props}>
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};