/**
 * Enhanced Groff parser for better document rendering
 * Handles various groff/troff formatting with improved accuracy
 */

export interface ParsedSection {
  name: string;
  content: string;
  subsections?: ParsedSubsection[];
  type?: string;
  metadata?: Record<string, any>;
}

export interface ParsedSubsection {
  name: string;
  content: string;
  type?: string;
}

export interface ParseOptions {
  preserveFormatting?: boolean;
  detectCodeBlocks?: boolean;
  enhanceLinks?: boolean;
  parseOptions?: boolean;
}

export class EnhancedGroffParser {
  private readonly macroMap: Map<string, (args: string[]) => string> = new Map();
  
  constructor() {
    this.initializeMacros();
  }

  private initializeMacros(): void {
    // Common groff macros
    this.macroMap.set('.TH', () => ''); // Title header - handled separately
    this.macroMap.set('.SH', (args) => `\n## ${args.join(' ')}\n`); // Section header
    this.macroMap.set('.SS', (args) => `\n### ${args.join(' ')}\n`); // Subsection
    this.macroMap.set('.PP', () => '\n\n'); // Paragraph
    this.macroMap.set('.P', () => '\n\n'); // Paragraph
    this.macroMap.set('.LP', () => '\n\n'); // Left paragraph
    this.macroMap.set('.TP', () => '\n'); // Tagged paragraph
    this.macroMap.set('.IP', (args) => `\n• ${args[0] || ''}`); // Indented paragraph
    this.macroMap.set('.HP', () => '\n'); // Hanging paragraph
    this.macroMap.set('.RS', () => ''); // Start relative indent
    this.macroMap.set('.RE', () => ''); // End relative indent
    this.macroMap.set('.B', (args) => `**${args.join(' ')}**`); // Bold
    this.macroMap.set('.I', (args) => `*${args.join(' ')}*`); // Italic
    this.macroMap.set('.BI', (args) => this.alternateFormat(args, true)); // Bold-italic
    this.macroMap.set('.BR', (args) => this.alternateFormat(args, false)); // Bold-roman
    this.macroMap.set('.IR', (args) => this.alternateItalicRoman(args)); // Italic-roman
    this.macroMap.set('.RB', (args) => this.reverseAlternateFormat(args)); // Roman-bold
    this.macroMap.set('.SM', (args) => args.join(' ')); // Small
    this.macroMap.set('.SB', (args) => `**${args.join(' ')}**`); // Small bold
    this.macroMap.set('.nf', () => '```\n'); // No fill (code block start)
    this.macroMap.set('.fi', () => '\n```'); // Fill (code block end)
    this.macroMap.set('.EX', () => '```\n'); // Example start
    this.macroMap.set('.EE', () => '\n```'); // Example end
    this.macroMap.set('.in', () => ''); // Indent
    this.macroMap.set('.sp', () => '\n'); // Space
    this.macroMap.set('.br', () => '  \n'); // Break
    this.macroMap.set('.ad', () => ''); // Adjust
    this.macroMap.set('.na', () => ''); // No adjust
    this.macroMap.set('.nh', () => ''); // No hyphenation
    this.macroMap.set('.hy', () => ''); // Hyphenation
  }

  private alternateFormat(args: string[], startBold: boolean): string {
    return args.map((arg, i) => {
      if (i % 2 === (startBold ? 0 : 1)) {
        return `**${arg}**`;
      }
      return arg;
    }).join(' ');
  }

  private alternateItalicRoman(args: string[]): string {
    return args.map((arg, i) => {
      if (i % 2 === 0) {
        return `*${arg}*`;
      }
      return arg;
    }).join(' ');
  }

  private reverseAlternateFormat(args: string[]): string {
    return args.map((arg, i) => {
      if (i % 2 === 1) {
        return `**${arg}**`;
      }
      return arg;
    }).join(' ');
  }

  public parseGroffContent(content: string, options: ParseOptions = {}): string {
    let result = content;
    
    // Remove backslash escapes for common characters
    result = result.replace(/\\-/g, '-');
    result = result.replace(/\\\s/g, ' ');
    result = result.replace(/\\\\/g, '\\');
    result = result.replace(/\\e/g, '\\');
    result = result.replace(/\\&/g, '');
    result = result.replace(/\\~/g, ' ');
    result = result.replace(/\\0/g, ' ');
    result = result.replace(/\\|/g, '');
    result = result.replace(/\\\^/g, '');
    
    // Process font changes inline
    result = result.replace(/\\fB([^\\]+)\\fR/g, '**$1**'); // Bold
    result = result.replace(/\\fI([^\\]+)\\fR/g, '*$1*'); // Italic
    result = result.replace(/\\fB([^\\]+)\\fP/g, '**$1**'); // Bold with previous font
    result = result.replace(/\\fI([^\\]+)\\fP/g, '*$1*'); // Italic with previous font
    
    // Process special characters
    result = result.replace(/\\'/g, '\'');
    result = result.replace(/\\`/g, '`');
    result = result.replace(/\\"/g, '"');
    result = result.replace(/\\\./g, '.');
    
    // Handle .TH (title) macros specially
    result = result.replace(/^\.TH\s+(.+)$/gm, (match, args) => {
      const parts = this.parseQuotedArgs(args);
      return `# ${parts[0] || ''} (${parts[1] || ''})`;
    });
    
    // Process all other macros
    const lines = result.split('\n');
    const processedLines: string[] = [];
    let inCodeBlock = false;
    let inExample = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Handle code block markers
      if (trimmedLine === '.nf' || trimmedLine === '.EX') {
        inCodeBlock = true;
        processedLines.push('```');
        continue;
      }
      
      if (trimmedLine === '.fi' || trimmedLine === '.EE') {
        inCodeBlock = false;
        processedLines.push('```');
        continue;
      }
      
      // Skip certain macros in code blocks
      if (inCodeBlock && !trimmedLine.startsWith('.')) {
        processedLines.push(line);
        continue;
      }
      
      // Process macro lines
      if (trimmedLine.startsWith('.')) {
        const processed = this.processMacroLine(trimmedLine);
        if (processed !== null) {
          processedLines.push(processed);
        }
      } else {
        processedLines.push(line);
      }
    }
    
    result = processedLines.join('\n');
    
    // Clean up extra newlines
    result = result.replace(/\n{3,}/g, '\n\n');
    
    // Enhance links if requested
    if (options.enhanceLinks) {
      result = this.enhanceLinks(result);
    }
    
    // Auto-detect code blocks if requested
    if (options.detectCodeBlocks) {
      result = this.autoDetectCodeBlocks(result);
    }
    
    return result.trim();
  }

  private processMacroLine(line: string): string | null {
    const match = line.match(/^\.(\w+)(?:\s+(.*))?$/);
    if (!match) return line;
    
    const [, macro, args] = match;
    const handler = this.macroMap.get(`.${macro}`);
    
    if (handler) {
      const parsedArgs = args ? this.parseQuotedArgs(args) : [];
      return handler(parsedArgs);
    }
    
    // Unknown macro - return as comment
    return `<!-- ${line} -->`;
  }

  private parseQuotedArgs(argsString: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];
      
      if (inQuotes) {
        if (char === quoteChar) {
          inQuotes = false;
          args.push(current);
          current = '';
        } else {
          current += char;
        }
      } else {
        if (char === '"' || char === "'") {
          inQuotes = true;
          quoteChar = char;
        } else if (char === ' ' || char === '\t') {
          if (current) {
            args.push(current);
            current = '';
          }
        } else {
          current += char;
        }
      }
    }
    
    if (current) {
      args.push(current);
    }
    
    return args;
  }

  private enhanceLinks(content: string): string {
    // Enhance man page references like command(section)
    content = content.replace(/\b(\w+)\((\d+)\)/g, (match, cmd, section) => {
      return `[${cmd}(${section})](/docs/${cmd}.${section})`;
    });
    
    // Enhance URLs
    content = content.replace(
      /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g,
      '[$1]($1)'
    );
    
    return content;
  }

  private autoDetectCodeBlocks(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let possibleCodeBlock: string[] = [];
    let inDetectedCodeBlock = false;
    
    for (const line of lines) {
      // Heuristics for code detection
      const looksLikeCode = 
        /^\s{4,}/.test(line) || // Indented 4+ spaces
        /^\$\s/.test(line.trim()) || // Shell prompt
        /^#\s/.test(line.trim()) || // Root shell prompt
        /^[a-z_]+\s*\(.*\)\s*{/.test(line) || // Function definition
        /^[A-Z_]+=[^=]+$/.test(line.trim()); // Environment variable
      
      if (looksLikeCode && !inDetectedCodeBlock) {
        if (possibleCodeBlock.length > 0) {
          result.push(...possibleCodeBlock);
          possibleCodeBlock = [];
        }
        inDetectedCodeBlock = true;
        result.push('```bash');
        result.push(line);
      } else if (inDetectedCodeBlock && !looksLikeCode && line.trim() === '') {
        // Empty line in code block - continue
        result.push(line);
      } else if (inDetectedCodeBlock && !looksLikeCode) {
        // End of code block
        result.push('```');
        result.push(line);
        inDetectedCodeBlock = false;
      } else {
        result.push(line);
      }
    }
    
    if (inDetectedCodeBlock) {
      result.push('```');
    }
    
    return result.join('\n');
  }

  public parseGroffSections(
    sections: Array<{ name: string; content: string; subsections?: any[] },
    options: ParseOptions = {}
  ): ParsedSection[] {
    return sections.map(section => {
      const parsed: ParsedSection = {
        name: section.name,
        content: this.parseGroffContent(section.content, options),
        type: this.detectSectionType(section.name),
      };

      if (section.subsections && section.subsections.length > 0) {
        parsed.subsections = section.subsections.map(sub => ({
          name: sub.name,
          content: this.parseGroffContent(sub.content, options),
          type: 'subsection',
        }));
      }

      // Add metadata for specific section types
      if (parsed.type === 'options' && options.parseOptions) {
        parsed.metadata = {
          options: this.extractOptions(parsed.content),
        };
      }

      return parsed;
    });
  }

  private detectSectionType(name: string): string {
    const normalized = name.toUpperCase();
    if (/^NAME/.test(normalized)) return 'name';
    if (/^SYNOP/.test(normalized)) return 'synopsis';
    if (/^DESCR/.test(normalized)) return 'description';
    if (/^OPTION/.test(normalized)) return 'options';
    if (/^EXAMPLE/.test(normalized)) return 'examples';
    if (/^EXIT/.test(normalized)) return 'exit-status';
    if (/^ENVIRON/.test(normalized)) return 'environment';
    if (/^FILE/.test(normalized)) return 'files';
    if (/^SEE/.test(normalized)) return 'see-also';
    if (/^BUG/.test(normalized)) return 'bugs';
    if (/^AUTHOR/.test(normalized)) return 'author';
    if (/^COPYRIGHT|LICENSE/.test(normalized)) return 'copyright';
    return 'general';
  }

  private extractOptions(content: string): Array<{
    flags: string[];
    description: string;
    argument?: string;
  } {
    const options: Array<{ flags: string[]; description: string; argument?: string } = [];
    const lines = content.split('\n');
    
    let currentOption: { flags: string[]; description: string; argument?: string } | null = null;
    let descLines: string[] = [];
    
    for (const line of lines) {
      // Match option patterns like: -h, --help
      const optionMatch = line.match(/^\s*((?:-[\w-]+(?:\s*,\s*)?)+)(?:\s+(\S+))?\s*(.*)$/);
      
      if (optionMatch) {
        // Save previous option
        if (currentOption) {
          currentOption.description = descLines.join(' ').trim();
          options.push(currentOption);
          descLines = [];
        }
        
        // Parse new option
        const [, flagsStr, arg, desc] = optionMatch;
        const flags = flagsStr.split(/\s*,\s*/).map(f => f.trim());
        
        currentOption = {
          flags,
          description: '',
          ...(arg && { argument: arg }),
        };
        
        if (desc) descLines.push(desc);
      } else if (currentOption && line.trim()) {
        // Continue description
        descLines.push(line.trim());
      }
    }
    
    // Save last option
    if (currentOption) {
      currentOption.description = descLines.join(' ').trim();
      options.push(currentOption);
    }
    
    return options;
  }
}

// Export singleton instance
export const enhancedGroffParser = new EnhancedGroffParser();