/**
 * Advanced groff/troff parser for BetterMan
 * Handles comprehensive groff formatting and converts to clean, modern text
 */

interface ParseOptions {
  preserveFormatting?: boolean;
  convertToMarkdown?: boolean;
}

/**
 * Parse groff-formatted content into clean, readable text
 */
export function parseGroffContent(content: string, options: ParseOptions = {}): string {
  if (!content) return '';
  
  const { convertToMarkdown = false } = options;
  
  // First clean any ANSI sequences if present
  let result = cleanAnsiSequences(content);
  
  // Step 1: Pre-process section names that might contain groff commands
  result = result.replace(/^\.B\s+(.+)$/gm, '$1'); // Remove .B from section names
  result = result.replace(/^\.I\s+(.+)$/gm, '$1'); // Remove .I from section names
  
  // Step 2: Handle groff macros and commands
  const groffCommands = [
    // Title and headers
    { pattern: /^\.TH\s+.*$/gm, replacement: '' },
    { pattern: /^\.SH\s+"?([^"]+)"?$/gm, replacement: convertToMarkdown ? '## $1' : '$1' },
    { pattern: /^\.SS\s+"?([^"]+)"?$/gm, replacement: convertToMarkdown ? '### $1' : '$1' },
    
    // Paragraphs and spacing
    { pattern: /^\.PP$/gm, replacement: '' },
    { pattern: /^\.LP$/gm, replacement: '' },
    { pattern: /^\.P$/gm, replacement: '' },
    { pattern: /^\.sp\s*\d*$/gm, replacement: '' },
    { pattern: /^\.br$/gm, replacement: '' },
    
    // Lists and indentation
    { pattern: /^\.TP\s*\d*$/gm, replacement: '' },
    { pattern: /^\.IP\s+"?([^"]*)"?\s*\d*$/gm, replacement: convertToMarkdown ? '• $1' : '• $1' },
    { pattern: /^\.RS\s*\d*$/gm, replacement: '' },
    { pattern: /^\.RE\s*\d*$/gm, replacement: '' },
    
    // Font and formatting (when on their own line)
    { pattern: /^\.B\s+(.+)$/gm, replacement: convertToMarkdown ? '**$1**' : '$1' },
    { pattern: /^\.I\s+(.+)$/gm, replacement: convertToMarkdown ? '*$1*' : '$1' },
    { pattern: /^\.BI\s+(.+)$/gm, replacement: convertToMarkdown ? '***$1***' : '$1' },
    { pattern: /^\.BR\s+(.+)$/gm, replacement: '$1' },
    { pattern: /^\.IR\s+(.+)$/gm, replacement: '$1' },
    { pattern: /^\.RB\s+(.+)$/gm, replacement: '$1' },
    { pattern: /^\.RI\s+(.+)$/gm, replacement: '$1' },
    
    // Special formatting
    { pattern: /^\.nf$/gm, replacement: '' }, // No fill mode
    { pattern: /^\.fi$/gm, replacement: '' }, // Fill mode
    { pattern: /^\.ad\s*.*$/gm, replacement: '' }, // Adjust
    { pattern: /^\.na$/gm, replacement: '' }, // No adjust
    
    // Comments and other
    { pattern: /^\.\\\".*$/gm, replacement: '' }, // Comments
    { pattern: /^\.\s*$/gm, replacement: '' }, // Empty command lines
  ];
  
  // Apply all groff command replacements
  groffCommands.forEach(({ pattern, replacement }) => {
    result = result.replace(pattern, replacement);
  });
  
  // Step 3: Handle inline font changes
  if (convertToMarkdown) {
    // Convert to markdown formatting
    result = result.replace(/\\fB([^\\]+?)\\f[RP]/g, '**$1**'); // Bold
    result = result.replace(/\\fI([^\\]+?)\\f[RP]/g, '*$1*'); // Italic
    result = result.replace(/\\f\(BI([^\\]+?)\\f[RP]/g, '***$1***'); // Bold-italic
  } else {
    // Just remove font codes
    result = result.replace(/\\f[BIRP]/g, ''); // Remove font codes
    result = result.replace(/\\f\([A-Z]{2}/g, ''); // Remove two-letter font codes
  }
  
  // Step 4: Handle parameter syntax
  result = result.replace(/\[\\fI([^\\]+?)\\fR\]/g, '[$1]'); // Optional parameters
  result = result.replace(/\\fI([^\\]+?)\\fR/g, convertToMarkdown ? '*$1*' : '$1'); // Parameters
  
  // Step 5: Handle special character escapes
  const specialChars = [
    { pattern: /\\\\/g, replacement: '\\' },
    { pattern: /\\-/g, replacement: '-' },
    { pattern: /\\&/g, replacement: '' },
    { pattern: /\\~/g, replacement: ' ' },
    { pattern: /\\ /g, replacement: ' ' },
    { pattern: /\\e/g, replacement: '\\' },
    { pattern: /\\,/g, replacement: ' ' },
    { pattern: /\\:/g, replacement: '' },
    { pattern: /\\\(co/g, replacement: '©' },
    { pattern: /\\\(rg/g, replacement: '®' },
    { pattern: /\\\(tm/g, replacement: '™' },
    { pattern: /\\\(aq/g, replacement: "'" },
    { pattern: /\\\(dq/g, replacement: '"' },
    { pattern: /\\\(em/g, replacement: '—' },
    { pattern: /\\\(en/g, replacement: '–' },
    { pattern: /\\\(bu/g, replacement: '•' },
    { pattern: /\\\(de/g, replacement: '°' },
    { pattern: /\\\(mu/g, replacement: '×' },
    { pattern: /\\\(di/g, replacement: '÷' },
  ];
  
  specialChars.forEach(({ pattern, replacement }) => {
    result = result.replace(pattern, replacement);
  });
  
  // Step 6: Clean up artifacts
  result = result.replace(/^\\&/gm, ''); // Remove leading \&
  result = result.replace(/^\s*\n/gm, '\n'); // Remove lines with only whitespace
  result = result.replace(/\n{3,}/g, '\n\n'); // Collapse multiple blank lines
  
  // Step 7: Process each line for final cleanup
  result = result
    .split('\n')
    .map(line => {
      // Remove any remaining groff commands we might have missed
      if (line.match(/^\.[A-Z]/)) {
        return '';
      }
      return line.trim();
    })
    .filter(line => line.length > 0 || result.indexOf('\n\n') > -1) // Preserve paragraph breaks
    .join('\n');
  
  // Step 8: Final formatting
  result = result.replace(/\n{3,}/g, '\n\n'); // Ensure max 2 newlines
  result = result.trim();
  
  return result;
}

/**
 * Clean ANSI escape sequences and terminal control characters
 */
export function cleanAnsiSequences(content: string): string {
  if (!content) return '';
  
  // Remove ANSI escape sequences
  let result = content.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  
  // Remove backspace-based formatting (bold and underline)
  result = result.replace(/(.)\x08\1/g, '$1'); // Bold: char + backspace + same char
  result = result.replace(/_\x08(.)/g, '$1'); // Underline: _ + backspace + char
  
  // Remove remaining control characters
  result = result.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  return result;
}

/**
 * Parse section names specifically (more aggressive cleaning)
 */
export function parseSectionName(name: string): string {
  if (!name) return '';
  
  // Remove all groff commands and formatting
  let cleaned = name
    .replace(/^\.[A-Z][A-Z0-9]*\s*/g, '') // Remove groff commands
    .replace(/\\f[BIRP]/g, '') // Remove font codes
    .replace(/\\f\([A-Z]{2}/g, '') // Remove two-letter font codes
    .replace(/[\\]/g, '') // Remove backslashes
    .trim();
  
  // If the name is all uppercase and longer than 3 chars, title case it
  if (cleaned.length > 3 && cleaned === cleaned.toUpperCase()) {
    cleaned = cleaned
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  return cleaned;
}

/**
 * Parse an array of sections with groff content
 */
export function parseGroffSections(sections: any[], options: ParseOptions = {}): any[] {
  if (!sections || !Array.isArray(sections)) return [];
  
  return sections
    .map(section => {
      const cleanName = parseSectionName(section.name || '');
      
      // Skip sections with invalid names
      if (!cleanName || cleanName.length === 0) {
        return null;
      }
      
      return {
        ...section,
        name: cleanName,
        content: parseGroffContent(section.content || '', options),
        subsections: section.subsections 
          ? section.subsections
              .map((sub: any) => {
                const subName = parseSectionName(sub.name || '');
                if (!subName) return null;
                
                return {
                  ...sub,
                  name: subName,
                  content: parseGroffContent(sub.content || '', options)
                };
              })
              .filter(Boolean)
          : []
      };
    })
    .filter(Boolean); // Remove null sections
}

/**
 * Convert groff content to markdown
 */
export function groffToMarkdown(content: string): string {
  return parseGroffContent(content, { convertToMarkdown: true });
}

/**
 * Check if content contains groff formatting
 */
export function hasGroffFormatting(content: string): boolean {
  if (!content) return false;
  
  // Check for common groff patterns
  const groffPatterns = [
    /^\.[A-Z]/m, // Groff commands
    /\\f[BIRP]/, // Font changes
    /\\\(/, // Special characters
    /^\.\\\"/, // Comments
  ];
  
  return groffPatterns.some(pattern => pattern.test(content));
}