/**
 * Advanced document parser for BetterMan
 * Handles complex formatting, code blocks, and options parsing
 */

interface ParsedOption {
  flag: string;
  description: string;
  argument?: string;
}

interface ParsedExample {
  description: string;
  code: string;
  language?: string;
}

/**
 * Parse OPTIONS section into structured data
 */
export function parseOptionsSection(content: string): ParsedOption[] {
  // Pre-process to remove common groff commands
  let processed = content
    .replace(/^\.(?:TP|IP|RS|RE|PP|LP|P|sp|br)\s*\d*$/gm, '')
    .replace(/^\.B\s+(.+)$/gm, '$1')
    .replace(/^\.I\s+(.+)$/gm, '$1')
    .replace(/^\.BI\s+(.+)$/gm, '$1');

  const lines = processed.split('\n');
  const options: ParsedOption[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }
    
    // Check if this line starts an option
    const optionMatch = trimmed.match(/^(-\w+(?:,\s*--[\w-]+)?|--[\w-]+)(?:\s+([A-Z][\w\[\]<>=-]*))?/);
    
    if (optionMatch) {
      const flag = optionMatch[1];
      const argument = optionMatch[2] || '';
      
      // Look ahead for description
      let description = '';
      const remainingOnLine = trimmed.substring(optionMatch[0].length).trim();
      
      if (remainingOnLine) {
        description = remainingOnLine;
      }
      
      // Collect multi-line descriptions
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trim();
        
        // Stop if we hit another option or empty line after description
        if (!nextTrimmed || nextTrimmed.match(/^-/)) {
          break;
        }
        
        // Check if line is indented (continuation)
        if (nextLine.match(/^\s{2,}/) || !nextTrimmed.match(/^[A-Z]/)) {
          if (description) description += ' ';
          description += nextTrimmed;
          i++;
        } else {
          break;
        }
      }
      
      options.push({
        flag,
        argument,
        description: description.trim()
      });
    } else {
      i++;
    }
  }
  
  return options;
}

/**
 * Parse EXAMPLES section into structured data
 */
export function parseExamplesSection(content: string): ParsedExample[] {
  const lines = content.split('\n');
  const examples: ParsedExample[] = [];
  
  let currentExample: ParsedExample = { description: '', code: '', language: 'bash' };
  let inCodeBlock = false;
  let codeIndent = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Detect code by various patterns
    const isCommandPrompt = line.match(/^\s*[$#]\s/);
    const isIndented = line.match(/^\s{4,}/) && trimmed;
    const isCodeContinuation = inCodeBlock && (line === '' || line.match(/^\s{2,}/));
    
    if (isCommandPrompt || (isIndented && !inCodeBlock && !line.match(/^\s+[A-Z]/))) {
      // Start new code block
      if (!inCodeBlock) {
        if (currentExample.description || currentExample.code) {
          examples.push({ ...currentExample });
          currentExample = { description: '', code: '', language: 'bash' };
        }
        inCodeBlock = true;
        const indent = line.match(/^(\s*)/);
        codeIndent = indent ? indent[1].length : 0;
      }
      
      // Add to code block (removing common indent)
      const lineIndent = line.match(/^(\s*)/);
      const actualIndent = lineIndent ? lineIndent[1].length : 0;
      const adjustedLine = actualIndent >= codeIndent 
        ? line.substring(codeIndent)
        : line.trimStart();
      
      currentExample.code += adjustedLine + '\n';
    } else if (isCodeContinuation) {
      // Continue code block
      const lineIndent = line.match(/^(\s*)/);
      const actualIndent = lineIndent ? lineIndent[1].length : 0;
      const adjustedLine = actualIndent >= codeIndent 
        ? line.substring(codeIndent)
        : line;
      
      currentExample.code += adjustedLine + '\n';
    } else if (trimmed) {
      // Non-code line with content
      if (inCodeBlock) {
        inCodeBlock = false;
        currentExample.code = currentExample.code.trimEnd();
        if (!currentExample.description) {
          currentExample.description = trimmed;
          examples.push({ ...currentExample });
          currentExample = { description: '', code: '', language: 'bash' };
        } else {
          examples.push({ ...currentExample });
          currentExample = { description: trimmed, code: '', language: 'bash' };
        }
      } else {
        if (currentExample.description) {
          currentExample.description += ' ' + trimmed;
        } else {
          currentExample.description = trimmed;
        }
      }
    }
  }
  
  // Don't forget the last example
  if (currentExample.code || currentExample.description) {
    currentExample.code = currentExample.code.trimEnd();
    examples.push(currentExample);
  }
  
  return examples.filter(ex => ex.code || ex.description);
}

/**
 * Detect and wrap code blocks in content
 */
export function detectCodeBlocks(content: string): string {
  // Already has markdown code blocks
  if (content.includes('```')) {
    return content;
  }
  
  const lines = content.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlock: string[] = [];
  let codeIndent = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Detect code patterns
    const isIndented = line.match(/^\s{4,}/) && trimmed;
    const isCommand = line.match(/^\s*[$#]\s/);
    const isEmpty = !trimmed;
    
    // Don't treat indented uppercase text as code
    const isText = isIndented && line.match(/^\s+[A-Z]/);
    
    if ((isIndented && !isText && !inCodeBlock) || (isCommand && !inCodeBlock)) {
      // Start code block
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
      result.push('```bash');
      inCodeBlock = true;
      const indent = line.match(/^(\s*)/);
      codeIndent = indent ? indent[1].length : 0;
      codeBlock = [];
    }
    
    if (inCodeBlock) {
      if (isEmpty || (isIndented && !isText) || isCommand) {
        // Continue code block
        const lineIndent = line.match(/^(\s*)/);
        const actualIndent = lineIndent ? lineIndent[1].length : 0;
        const adjustedLine = actualIndent >= codeIndent 
          ? line.substring(codeIndent)
          : line;
        codeBlock.push(adjustedLine);
      } else {
        // End code block
        result.push(...codeBlock);
        result.push('```');
        result.push('');
        inCodeBlock = false;
        codeBlock = [];
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }
  
  // Close any open code block
  if (inCodeBlock && codeBlock.length > 0) {
    result.push(...codeBlock);
    result.push('```');
  }
  
  return result.join('\n');
}

/**
 * Parse SYNOPSIS section with syntax highlighting data
 */
export function parseSynopsisSection(content: string): Array<{
  command?: string;
  flags?: string[];
  args?: string[];
  text?: string;
}> {
  const lines = content.trim().split('\n');
  const parsed: Array<any> = [];
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    // Check if this is a command line
    if (trimmed.match(/^[a-zA-Z][\w-]*/)) {
      const parts = trimmed.split(/\s+/);
      const command = parts[0];
      const flags: string[] = [];
      const args: string[] = [];
      
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (part.startsWith('-')) {
          flags.push(part);
        } else if (part.startsWith('[') || part.match(/^[A-Z]/)) {
          args.push(part);
        } else {
          args.push(part);
        }
      }
      
      parsed.push({ command, flags, args });
    } else {
      parsed.push({ text: trimmed });
    }
  });
  
  return parsed;
}