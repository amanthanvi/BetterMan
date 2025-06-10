import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { TryItButton } from './TryItButton';
import { Copy, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

interface EnhancedCodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  showTryIt?: boolean;
  className?: string;
}

// Pattern to detect if code is a shell command
const isShellCommand = (code: string, language?: string): boolean => {
  // Check language hint
  if (language && ['bash', 'sh', 'shell', 'terminal'].includes(language)) {
    return true;
  }
  
  // Check for common command patterns
  const trimmedCode = code.trim();
  const shellPatterns = [
    /^[$#]\s+/,           // Starts with $ or # prompt
    /^(ls|cd|pwd|echo|cat|grep|find|man|sudo|apt|yum|docker|git|npm|yarn)\s/,  // Common commands
    /\s\|\s/,             // Contains pipes
    /\s>[>\s]/,           // Contains redirects
  ];
  
  return shellPatterns.some(pattern => pattern.test(trimmedCode));
};

// Extract the actual command from a code block (removing prompts)
const extractCommand = (code: string): string => {
  const lines = code.trim().split('\n');
  const commands: string[] = [];
  
  for (const line of lines) {
    // Remove common shell prompts
    const cleanedLine = line
      .replace(/^[$#]\s+/, '')           // Remove $ or # prompt
      .replace(/^(.*?)[>#]\s+/, '')      // Remove custom prompts
      .trim();
    
    // Skip empty lines and output lines (heuristic)
    if (cleanedLine && !cleanedLine.startsWith('   ')) {
      commands.push(cleanedLine);
    }
  }
  
  return commands.join(' && ');
};

export const EnhancedCodeBlock: React.FC<EnhancedCodeBlockProps> = ({
  code,
  language = 'text',
  showLineNumbers = false,
  showTryIt = true,
  className
}) => {
  const [copied, setCopied] = useState(false);
  
  const isExecutable = showTryIt && isShellCommand(code, language);
  const command = isExecutable ? extractCommand(code) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={cn('relative group', className)}>
      <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          className="h-7 px-2 bg-gray-800/50 hover:bg-gray-700/50 text-gray-300"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              Copy
            </>
          )}
        </Button>
        
        {isExecutable && command && (
          <TryItButton command={command} variant="inline" />
        )}
      </div>
      
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        showLineNumbers={showLineNumbers}
        customStyle={{
          margin: 0,
          borderRadius: '0.5rem',
          padding: '1rem',
          fontSize: '0.875rem',
          lineHeight: '1.5',
        }}
        codeTagProps={{
          style: {
            fontFamily: '"Cascadia Code", Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
          }
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};