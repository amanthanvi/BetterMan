import { exec } from 'child_process'
import { promisify } from 'util'
import { createHash } from 'crypto'

const execAsync = promisify(exec)

export interface ManPageFlag {
  flag: string
  shortFlag?: string
  description: string
  argument?: string
  optional?: boolean
  deprecated?: boolean
}

export interface ManPageExample {
  command: string
  description: string
  output?: string
  tags?: string[]
}

export interface ManPageSection {
  id: string
  title: string
  content: string
  level: number
  subsections?: ManPageSection[]
  codeBlocks?: string[]
  flags?: ManPageFlag[]
}

export interface ManPageMetadata {
  author?: string
  version?: string
  date?: string
  source?: string
  manual?: string
}

export interface EnhancedManPage {
  // Basic info
  name: string
  section: number
  title: string
  description: string
  synopsis: string
  category: string
  
  // Structured content
  sections: ManPageSection[]
  flags: ManPageFlag[]
  examples: ManPageExample[]
  
  // Relationships
  relatedCommands: string[]
  seeAlso: Array<{ name: string; section: number }>
  
  // Metadata
  metadata: ManPageMetadata
  searchContent: string
  keywords: string[]
  complexity: 'basic' | 'intermediate' | 'advanced'
  
  // Processing info
  hash: string
  parsedAt: string
  parseVersion: string
  
  // Features
  hasInteractiveExamples?: boolean
  hasDiagrams?: boolean
  isCommon: boolean
  popularity?: number
}

export class EnhancedManPageParserV2 {
  private static readonly VERSION = '2.1.0'
  
  // Enhanced groff cleaning patterns
  private static readonly GROFF_PATTERNS = {
    // Remove all groff commands
    commands: /^\.[A-Z]{2}.*$/gm,
    // Remove font changes
    fonts: /\\f[BIPRH]/g,
    fontParen: /\\f\([A-Z]{2}/g,
    fontBracket: /\\f\[[^\]]+\]/g,
    // Remove special escapes
    escapes: /\\[&\-~0|^]/g,
    quotes: /\\(aq|\\(cq|\\(oq|\\(dq/g,
    dashes: /\\(em|\\(en/g,
    spaces: /\\ /g,
    backslash: /\\\\/g,
    // Clean up artifacts
    doubleSpaces: /\s{2,}/g,
    leadingSpaces: /^\s+/gm,
    trailingSpaces: /\s+$/gm,
    emptyLines: /\n{3,}/g,
  }
  
  // Section header patterns
  private static readonly SECTION_PATTERNS = {
    name: /^(NAME|NOME?|BEZEICHNUNG)/i,
    synopsis: /^(SYNOPSIS?|SYNTAX|OVERVIEW|ZUSAMMENFASSUNG)/i,
    description: /^(DESCRIPTION|BESCHREIBUNG)/i,
    options: /^(OPTIONS?|FLAGS?|ARGUMENTS?|PARAMETERS?|OPTIONEN)/i,
    examples: /^(EXAMPLES?|BEISPIELE?)/i,
    seeAlso: /^(SEE ALSO|SIEHE AUCH|RELATED|VOIR AUSSI)/i,
    author: /^(AUTHOR|AUTHORS|WRITTEN BY|AUTOREN?)/i,
    bugs: /^(BUGS?|REPORTING BUGS|FEHLER)/i,
    files: /^(FILES|DATEIEN)/i,
    environment: /^(ENVIRONMENT|UMGEBUNG)/i,
    notes: /^(NOTES?|HINWEISE?)/i,
    history: /^(HISTORY|GESCHICHTE)/i,
  }
  
  /**
   * Parse a man page from the system with improved content extraction
   */
  static async parseFromSystem(command: string, section?: number): Promise<EnhancedManPage | null> {
    try {
      // Clean command name
      const cleanCommand = command.replace(/[^a-zA-Z0-9._-]/g, '')
      
      // Get raw man page content
      const sectionArg = section ? section.toString() : ''
      
      // Use MANWIDTH to control formatting width
      const env = { ...process.env, MANWIDTH: '80', COLUMNS: '80' }
      
      // Get formatted content (col -b removes backspaces and other formatting)
      const { stdout: rawContent } = await execAsync(
        `MANWIDTH=80 man ${sectionArg} '${cleanCommand}' 2>/dev/null | col -bx`,
        { maxBuffer: 10 * 1024 * 1024, env }
      )
      
      if (!rawContent || rawContent.trim().length < 50) {
        return null
      }
      
      // Get groff source if available for metadata
      let groffContent = ''
      try {
        const { stdout } = await execAsync(
          `man -w ${sectionArg} '${cleanCommand}' 2>/dev/null | xargs zcat 2>/dev/null || man -w ${sectionArg} '${cleanCommand}' 2>/dev/null | xargs cat`,
          { maxBuffer: 10 * 1024 * 1024 }
        )
        groffContent = stdout
      } catch {
        // Groff source not available, continue with formatted content only
      }
      
      return this.parseContent(cleanCommand, rawContent, groffContent, section)
    } catch (error) {
      console.error(`Failed to parse man page for ${command}:`, error)
      return null
    }
  }

  /**
   * Enhanced content parsing with better section extraction
   */
  static parseContent(
    name: string,
    formattedContent: string,
    groffContent: string,
    section?: number
  ): EnhancedManPage {
    // Extract metadata from groff if available
    const metadata = groffContent ? this.extractMetadata(groffContent) : {}
    
    // Parse sections from formatted content
    const parsedSections = this.parseSections(formattedContent)
    
    // Extract section number if not provided
    const actualSection = section || this.extractSectionNumber(formattedContent, name) || 1
    
    // Extract core information
    const title = this.extractTitle(parsedSections, name)
    const description = this.extractDescription(parsedSections, formattedContent)
    const synopsis = this.extractSynopsis(parsedSections)
    
    // Extract structured data
    const flags = this.extractFlags(parsedSections, synopsis)
    const examples = this.extractExamples(parsedSections)
    const { relatedCommands, seeAlso } = this.extractRelationships(parsedSections, name)
    
    // Generate additional metadata
    const keywords = this.generateKeywords(name, title, description)
    const complexity = this.determineComplexity(name, flags.length, examples.length)
    const searchContent = this.generateSearchContent(name, title, description, synopsis)
    
    // Clean up sections content
    const cleanedSections = this.cleanSections(parsedSections)
    
    return {
      name,
      section: actualSection,
      title,
      description,
      synopsis,
      category: this.getCategoryName(actualSection),
      sections: cleanedSections,
      flags,
      examples,
      relatedCommands,
      seeAlso,
      metadata,
      searchContent,
      keywords,
      complexity,
      hash: createHash('sha256').update(formattedContent).digest('hex').slice(0, 16),
      parsedAt: new Date().toISOString(),
      parseVersion: this.VERSION,
      isCommon: this.isCommonCommand(name),
      hasInteractiveExamples: examples.some(e => e.output !== undefined),
    }
  }

  /**
   * Parse sections with improved header detection
   */
  private static parseSections(content: string): ManPageSection[] {
    const sections: ManPageSection[] = []
    const lines = content.split('\n')
    
    let currentSection: ManPageSection | null = null
    let contentBuffer: string[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      
      // Check if this is a section header (all caps, at start of line)
      if (trimmed && trimmed === trimmed.toUpperCase() && /^[A-Z\s]+$/.test(trimmed)) {
        // Save previous section
        if (currentSection) {
          currentSection.content = contentBuffer.join('\n').trim()
          if (currentSection.content) {
            sections.push(currentSection)
          }
        }
        
        // Start new section
        currentSection = {
          id: trimmed.toLowerCase().replace(/\s+/g, '-'),
          title: trimmed,
          content: '',
          level: 1
        }
        contentBuffer = []
      } else if (currentSection) {
        // Skip page headers/footers
        if (!this.isPageHeaderFooter(line)) {
          contentBuffer.push(line)
        }
      } else {
        // Content before first section
        contentBuffer.push(line)
      }
    }
    
    // Save last section
    if (currentSection) {
      currentSection.content = contentBuffer.join('\n').trim()
      if (currentSection.content) {
        sections.push(currentSection)
      }
    }
    
    return sections
  }

  /**
   * Check if line is a page header/footer
   */
  private static isPageHeaderFooter(line: string): boolean {
    // Common patterns for headers/footers
    return /^(Linux|macOS|BSD|Unix|GNU)\s+\d+\.\d+.*\d{4}\s*$/i.test(line.trim()) ||
           /^\s*\d+\s*$/.test(line) || // Page numbers
           /^[A-Z]+\(\d+\)\s+.*\s+[A-Z]+\(\d+\)$/.test(line) // MAN(1) format
  }

  /**
   * Extract title from NAME section or fallback
   */
  private static extractTitle(sections: ManPageSection[], name: string): string {
    const nameSection = sections.find(s => this.SECTION_PATTERNS.name.test(s.title))
    
    if (nameSection && nameSection.content) {
      // Extract from "command - description" format
      const match = nameSection.content.match(/^\s*\S+\s*[-–—]\s*(.+)$/m)
      if (match) {
        return match[1].trim()
      }
      // Fallback to first line of content
      const firstLine = nameSection.content.split('\n')[0].trim()
      if (firstLine && !firstLine.includes(name)) {
        return firstLine
      }
    }
    
    return `${name} manual page`
  }

  /**
   * Extract description with fallback strategies
   */
  private static extractDescription(sections: ManPageSection[], fullContent: string): string {
    // Try DESCRIPTION section first
    const descSection = sections.find(s => this.SECTION_PATTERNS.description.test(s.title))
    if (descSection && descSection.content) {
      const firstPara = descSection.content.split('\n\n')[0].trim()
      if (firstPara.length > 20) {
        return firstPara
      }
    }
    
    // Try NAME section
    const nameSection = sections.find(s => this.SECTION_PATTERNS.name.test(s.title))
    if (nameSection && nameSection.content) {
      const match = nameSection.content.match(/^\s*\S+\s*[-–—]\s*(.+)$/m)
      if (match) {
        return match[1].trim()
      }
    }
    
    // Fallback to first meaningful paragraph
    const paragraphs = fullContent.split('\n\n')
    for (const para of paragraphs) {
      const cleaned = para.trim()
      if (cleaned.length > 30 && !this.isPageHeaderFooter(cleaned)) {
        return cleaned
      }
    }
    
    return 'No description available'
  }

  /**
   * Extract synopsis from SYNOPSIS section
   */
  private static extractSynopsis(sections: ManPageSection[]): string {
    const synopsisSection = sections.find(s => this.SECTION_PATTERNS.synopsis.test(s.title))
    
    if (synopsisSection && synopsisSection.content) {
      // Clean up and format
      return synopsisSection.content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !this.isPageHeaderFooter(line))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    }
    
    return ''
  }

  /**
   * Extract flags from OPTIONS section and synopsis
   */
  private static extractFlags(sections: ManPageSection[], synopsis: string): ManPageFlag[] {
    const flags: ManPageFlag[] = []
    const flagMap = new Map<string, ManPageFlag>()
    
    // Find options section
    const optionsSection = sections.find(s => this.SECTION_PATTERNS.options.test(s.title))
    
    if (optionsSection && optionsSection.content) {
      const lines = optionsSection.content.split('\n')
      let currentFlag: ManPageFlag | null = null
      let descBuffer: string[] = []
      
      for (const line of lines) {
        // Check for flag line (starts with -, --, or contains flag pattern)
        const flagMatch = line.match(/^\s*(-{1,2}[a-zA-Z0-9][-a-zA-Z0-9]*)\s*(?:\[([^\]]+)\])?\s*(.*)$/)
        
        if (flagMatch) {
          // Save previous flag
          if (currentFlag) {
            currentFlag.description = descBuffer.join(' ').trim()
            if (!flagMap.has(currentFlag.flag)) {
              flagMap.set(currentFlag.flag, currentFlag)
            }
          }
          
          // Start new flag
          currentFlag = {
            flag: flagMatch[1],
            argument: flagMatch[2],
            description: flagMatch[3].trim()
          }
          descBuffer = flagMatch[3] ? [flagMatch[3]] : []
          
          // Check for short/long flag pairs
          const shortLongMatch = line.match(/^\s*(-[a-zA-Z]),?\s+(--[a-zA-Z][-a-zA-Z0-9]*)/);
          if (shortLongMatch) {
            currentFlag.shortFlag = shortLongMatch[1]
            currentFlag.flag = shortLongMatch[2]
          }
        } else if (currentFlag && line.trim()) {
          // Continuation of description
          descBuffer.push(line.trim())
        }
      }
      
      // Save last flag
      if (currentFlag) {
        currentFlag.description = descBuffer.join(' ').trim()
        if (!flagMap.has(currentFlag.flag)) {
          flagMap.set(currentFlag.flag, currentFlag)
        }
      }
    }
    
    // Also extract flags from synopsis
    const synopsisFlags = synopsis.match(/-{1,2}[a-zA-Z][-a-zA-Z0-9]*/g) || []
    for (const flag of synopsisFlags) {
      if (!flagMap.has(flag)) {
        flagMap.set(flag, {
          flag,
          description: 'See manual for details'
        })
      }
    }
    
    return Array.from(flagMap.values())
  }

  /**
   * Extract examples with improved formatting
   */
  private static extractExamples(sections: ManPageSection[]): ManPageExample[] {
    const examples: ManPageExample[] = []
    
    const examplesSection = sections.find(s => this.SECTION_PATTERNS.examples.test(s.title))
    
    if (examplesSection && examplesSection.content) {
      const lines = examplesSection.content.split('\n')
      let currentExample: ManPageExample | null = null
      let outputBuffer: string[] = []
      let descBuffer: string[] = []
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        
        // Check for command line (starts with $ or # or common command patterns)
        if (line.match(/^\s*[\$#]\s*.+/) || line.match(/^\s*(sudo\s+)?[a-z][-a-z0-9]*\s+/)) {
          // Save previous example
          if (currentExample) {
            if (outputBuffer.length > 0) {
              currentExample.output = outputBuffer.join('\n').trim()
            }
            if (descBuffer.length > 0 && !currentExample.description) {
              currentExample.description = descBuffer.join(' ').trim()
            }
            examples.push(currentExample)
          }
          
          // Extract command
          const command = line.replace(/^\s*[\$#]\s*/, '').trim()
          currentExample = {
            command,
            description: '',
            tags: this.extractExampleTags(command)
          }
          outputBuffer = []
          descBuffer = []
        } else if (currentExample) {
          // Check if this is output (indented) or description
          if (line.match(/^\s{2,}/) || (outputBuffer.length > 0 && line.trim())) {
            outputBuffer.push(line)
          } else if (line.trim()) {
            descBuffer.push(line.trim())
          }
        }
      }
      
      // Save last example
      if (currentExample) {
        if (outputBuffer.length > 0) {
          currentExample.output = outputBuffer.join('\n').trim()
        }
        if (descBuffer.length > 0 && !currentExample.description) {
          currentExample.description = descBuffer.join(' ').trim()
        }
        examples.push(currentExample)
      }
    }
    
    return examples
  }

  /**
   * Extract relationships without duplicates or self-references
   */
  private static extractRelationships(sections: ManPageSection[], currentCommand: string): {
    relatedCommands: string[]
    seeAlso: Array<{ name: string; section: number }>
  } {
    const relatedSet = new Set<string>()
    const seeAlsoMap = new Map<string, { name: string; section: number }>()
    
    const seeAlsoSection = sections.find(s => this.SECTION_PATTERNS.seeAlso.test(s.title))
    
    if (seeAlsoSection && seeAlsoSection.content) {
      // Match command(section) pattern
      const matches = seeAlsoSection.content.matchAll(/([a-zA-Z0-9._-]+)\((\d+)\)/g)
      
      for (const match of matches) {
        const name = match[1]
        const section = parseInt(match[2])
        
        // Skip self-references
        if (name.toLowerCase() !== currentCommand.toLowerCase()) {
          const key = `${name}-${section}`
          if (!seeAlsoMap.has(key)) {
            seeAlsoMap.set(key, { name, section })
            relatedSet.add(name)
          }
        }
      }
    }
    
    return {
      relatedCommands: Array.from(relatedSet).slice(0, 15),
      seeAlso: Array.from(seeAlsoMap.values())
    }
  }

  /**
   * Clean sections by removing artifacts
   */
  private static cleanSections(sections: ManPageSection[]): ManPageSection[] {
    return sections.map(section => ({
      ...section,
      content: section.content
        .split('\n')
        .filter(line => !this.isPageHeaderFooter(line))
        .join('\n')
        .replace(this.GROFF_PATTERNS.doubleSpaces, ' ')
        .replace(this.GROFF_PATTERNS.emptyLines, '\n\n')
        .trim()
    })).filter(section => 
      section.content.length > 5 && 
      section.title !== 'NAME' // NAME content is already in title/description
    )
  }

  // Utility methods remain the same...
  private static extractMetadata(groffContent: string): ManPageMetadata {
    const metadata: ManPageMetadata = {}
    
    const thMatch = groffContent.match(/^\.TH\s+(\S+)\s+(\S+)\s+"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"/m)
    if (thMatch) {
      metadata.date = thMatch[3]
      metadata.source = thMatch[4]
      metadata.manual = thMatch[5]
    }
    
    return metadata
  }

  private static extractSectionNumber(content: string, name: string): number | undefined {
    const match = content.match(new RegExp(`${name}\\((\\d+)\\)`, 'i'))
    return match ? parseInt(match[1]) : undefined
  }

  private static generateKeywords(name: string, title: string, description: string): string[] {
    const keywords = new Set<string>()
    keywords.add(name)
    
    const words = (title + ' ' + description)
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3 && !this.isStopWord(w))
    
    words.slice(0, 10).forEach(w => keywords.add(w))
    
    return Array.from(keywords)
  }

  private static generateSearchContent(name: string, title: string, description: string, synopsis: string): string {
    return [name, title, description, synopsis]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private static extractExampleTags(command: string): string[] {
    const tags: string[] = []
    if (command.includes('|')) tags.push('pipe')
    if (command.includes('>')) tags.push('redirect')
    if (command.includes('sudo')) tags.push('admin')
    return tags
  }

  private static determineComplexity(name: string, flagCount: number, exampleCount: number): 'basic' | 'intermediate' | 'advanced' {
    const basicCommands = new Set(['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo'])
    const advancedCommands = new Set(['git', 'docker', 'awk', 'sed', 'systemctl', 'iptables'])
    
    if (basicCommands.has(name)) return 'basic'
    if (advancedCommands.has(name)) return 'advanced'
    if (flagCount < 5) return 'basic'
    if (flagCount > 20) return 'advanced'
    return 'intermediate'
  }

  private static isCommonCommand(name: string): boolean {
    const common = [
      'ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'touch',
      'grep', 'find', 'sed', 'awk', 'sort', 'uniq', 'head', 'tail', 'less',
      'chmod', 'chown', 'ps', 'kill', 'top', 'df', 'du', 'tar', 'ssh'
    ]
    return common.includes(name)
  }

  private static getCategoryName(section: number): string {
    const categories: Record<number, string> = {
      1: 'User Commands',
      2: 'System Calls',
      3: 'Library Functions',
      4: 'Special Files',
      5: 'File Formats',
      6: 'Games',
      7: 'Miscellaneous',
      8: 'System Administration'
    }
    return categories[section] || 'Other'
  }

  private static isStopWord(word: string): boolean {
    const stopWords = new Set(['the', 'and', 'for', 'are', 'with', 'this', 'that', 'from'])
    return stopWords.has(word)
  }
}