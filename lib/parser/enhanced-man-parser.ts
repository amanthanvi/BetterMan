import { exec } from 'child_process'
import { promisify } from 'util'
import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

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

export class EnhancedManPageParser {
  private static readonly VERSION = '2.0.0'
  
  // Enhanced patterns for better parsing
  private static readonly PATTERNS = {
    section: /^\.SH\s+"?([^"]+)"?$/gm,
    subsection: /^\.SS\s+"?([^"]+)"?$/gm,
    flag: /^\s*(-{1,2}[a-zA-Z0-9][-a-zA-Z0-9]*)\s*(?:\[([^\]]+)\])?\s*(.*)$/,
    example: /^\s*\$\s*(.+)$/,
    seeAlso: /([a-z0-9_-]+)\((\d+)\)/gi,
    codeBlock: /^\s{4,}(.+)$/gm,
    metadata: {
      author: /^\.TH\s+\S+\s+\S+\s+"([^"]+)"/,
      version: /Version\s+([\d.]+)/i,
      date: /^\.TH\s+\S+\s+\S+\s+"[^"]*"\s+"([^"]+)"/
    }
  }
  
  // Common commands categorized by complexity
  private static readonly COMMAND_COMPLEXITY = {
    basic: new Set(['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'touch', 'which', 'clear', 'exit']),
    intermediate: new Set(['grep', 'find', 'sed', 'awk', 'cut', 'sort', 'uniq', 'chmod', 'ps', 'kill', 'tar', 'curl', 'ssh']),
    advanced: new Set(['git', 'docker', 'systemctl', 'iptables', 'tcpdump', 'strace', 'gdb', 'make', 'gcc'])
  }
  
  // Groff escape sequences (from Python parser)
  private static readonly ESCAPE_SEQUENCES: Record<string, string> = {
    '\\-': '-',
    '\\ ': ' ',
    '\\e': '\\',
    '\\&': '',
    '\\(aq': "'",
    '\\(cq': "'",
    '\\(oq': "'",
    '\\(dq': '"',
    '\\(em': '—',
    '\\(en': '–',
    '\\(bu': '•',
    '\\(co': '©',
    '\\(rg': '®',
    '\\(tm': '™',
    '\\~': ' ',
    '\\0': ' ',
    '\\|': '',
    '\\^': '',
    '\\\\': '\\',
  }

  /**
   * Parse a man page from the system with enhanced features
   */
  static async parseFromSystem(command: string, section?: number): Promise<EnhancedManPage | null> {
    try {
      // Clean command name to avoid shell injection issues
      const cleanCommand = command.replace(/[^a-zA-Z0-9._-]/g, '')
      if (cleanCommand !== command) {
        console.warn(`Command name sanitized: ${command} -> ${cleanCommand}`)
      }
      
      // Get both raw groff and formatted content
      const sectionArg = section ? section.toString() : ''
      
      // Get raw groff content
      const { stdout: groffContent } = await execAsync(
        `man -P cat ${sectionArg} '${cleanCommand}' 2>/dev/null || true`
      )
      
      if (!groffContent || groffContent.trim().length < 50) {
        return null
      }
      
      // Get formatted content for easier parsing
      const { stdout: formattedContent } = await execAsync(
        `man ${sectionArg} '${cleanCommand}' | col -b 2>/dev/null || true`
      )
      
      // Parse with enhanced features
      return this.parseContent(cleanCommand, groffContent, formattedContent, section)
    } catch (error) {
      console.error(`Failed to parse man page for ${command}:`, error)
      return null
    }
  }

  /**
   * Enhanced content parsing with structured data extraction
   */
  static parseContent(
    name: string,
    groffContent: string,
    formattedContent: string,
    section?: number
  ): EnhancedManPage {
    // Clean groff content first
    const cleanedContent = this.cleanGroffContent(groffContent)
    
    // Extract metadata from groff
    const metadata = this.extractMetadata(groffContent)
    
    // Extract section number
    const actualSection = section || this.extractSection(formattedContent) || 1
    
    // Extract basic information
    const title = this.extractTitle(formattedContent, name)
    const description = this.extractDescription(formattedContent)
    const synopsis = this.extractSynopsis(formattedContent)
    
    // Parse sections with enhanced structure
    const sections = this.parseSections(formattedContent)
    
    // Extract flags from synopsis and options section
    const flags = this.extractFlags(formattedContent, synopsis)
    
    // Extract enhanced examples
    const examples = this.extractEnhancedExamples(formattedContent)
    
    // Extract relationships
    const { relatedCommands, seeAlso } = this.extractRelationships(formattedContent)
    
    // Generate keywords
    const keywords = this.generateKeywords(name, title, description, sections)
    
    // Determine complexity
    const complexity = this.determineComplexity(name, flags.length, examples.length)
    
    // Generate hash
    const hash = createHash('sha256').update(groffContent).digest('hex').slice(0, 16)
    
    // Generate enhanced search content
    const searchContent = this.generateSearchContent({
      name,
      title,
      description,
      synopsis,
      sections,
      examples,
      flags,
      keywords
    })
    
    return {
      name,
      section: actualSection,
      title,
      description,
      synopsis,
      category: this.getCategoryName(actualSection),
      sections,
      flags,
      examples,
      relatedCommands,
      seeAlso,
      metadata,
      searchContent,
      keywords,
      complexity,
      hash,
      parsedAt: new Date().toISOString(),
      parseVersion: this.VERSION,
      isCommon: this.isCommonCommand(name),
      hasInteractiveExamples: examples.some(e => e.output !== undefined),
      hasDiagrams: false // TODO: Implement diagram detection
    }
  }

  /**
   * Clean groff content using patterns from Python parser
   */
  private static cleanGroffContent(content: string): string {
    let cleaned = content
    
    // Remove comments
    cleaned = cleaned.replace(/\\".*$/gm, '')
    cleaned = cleaned.replace(/^\.\\".*$/gm, '')
    
    // Remove font formatting
    cleaned = cleaned.replace(/\\f[BIPRSCW]/g, '')
    cleaned = cleaned.replace(/\\f\([A-Z]{2}/g, '')
    cleaned = cleaned.replace(/\\f\[[^\]]+\]/g, '')
    
    // Apply escape sequences
    for (const [escape, replacement] of Object.entries(this.ESCAPE_SEQUENCES)) {
      cleaned = cleaned.replace(new RegExp(escape.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement)
    }
    
    // Remove remaining groff commands
    cleaned = cleaned.replace(/^\.[A-Z]{2}.*$/gm, '')
    
    return cleaned
  }

  /**
   * Extract metadata from groff content
   */
  private static extractMetadata(groffContent: string): ManPageMetadata {
    const metadata: ManPageMetadata = {}
    
    // Extract from .TH line
    const thMatch = groffContent.match(/^\.TH\s+(\S+)\s+(\S+)\s+"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"/m)
    if (thMatch) {
      metadata.date = thMatch[3]
      metadata.source = thMatch[4]
      metadata.manual = thMatch[5]
    }
    
    // Look for author information
    const authorMatch = groffContent.match(/Authors?:?\s*(.+)$/mi)
    if (authorMatch) {
      metadata.author = authorMatch[1].trim()
    }
    
    return metadata
  }

  /**
   * Extract flags with detailed information
   */
  private static extractFlags(content: string, synopsis: string): ManPageFlag[] {
    const flags: ManPageFlag[] = []
    const flagMap = new Map<string, ManPageFlag>()
    
    // Extract from synopsis
    const synopsisFlags = synopsis.matchAll(/(-{1,2}[a-zA-Z0-9][-a-zA-Z0-9]*)\s*(?:\[([^\]]+)\])?/g)
    for (const match of synopsisFlags) {
      const flag = match[1]
      flagMap.set(flag, {
        flag,
        description: '',
        argument: match[2],
        optional: synopsis.includes(`[${flag}`)
      })
    }
    
    // Extract from OPTIONS section
    const optionsSection = content.match(/OPTIONS\s+([\s\S]+?)(?=\n[A-Z]+\s*\n|$)/i)
    if (optionsSection) {
      const lines = optionsSection[1].split('\n')
      let currentFlag: ManPageFlag | null = null
      
      for (const line of lines) {
        const flagMatch = line.match(this.PATTERNS.flag)
        if (flagMatch) {
          if (currentFlag) {
            flags.push(currentFlag)
          }
          
          const flagName = flagMatch[1]
          currentFlag = flagMap.get(flagName) || {
            flag: flagName,
            description: flagMatch[3]?.trim() || '',
            argument: flagMatch[2]
          }
          
          // Check for short/long flag pairs
          if (flagName.startsWith('--') && flags.length > 0) {
            const lastFlag = flags[flags.length - 1]
            if (lastFlag.flag.startsWith('-') && !lastFlag.flag.startsWith('--')) {
              currentFlag.shortFlag = lastFlag.flag
              flags.pop()
            }
          }
        } else if (currentFlag && line.trim()) {
          currentFlag.description += ' ' + line.trim()
        }
      }
      
      if (currentFlag) {
        flags.push(currentFlag)
      }
    }
    
    return flags
  }

  /**
   * Extract enhanced examples with output and tags
   */
  private static extractEnhancedExamples(content: string): ManPageExample[] {
    const examples: ManPageExample[] = []
    const exampleSection = content.match(/EXAMPLES?\s+([\s\S]+?)(?=\n[A-Z]+\s*\n|$)/i)
    
    if (exampleSection) {
      const lines = exampleSection[1].split('\n')
      let currentExample: ManPageExample | null = null
      let collectingOutput = false
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        
        // Check for example command
        const cmdMatch = line.match(this.PATTERNS.example)
        if (cmdMatch) {
          if (currentExample) {
            examples.push(currentExample)
          }
          
          currentExample = {
            command: cmdMatch[1].trim(),
            description: '',
            tags: this.extractExampleTags(cmdMatch[1])
          }
          
          // Look for description in next lines
          if (i + 1 < lines.length && !lines[i + 1].match(/^\s*\$/)) {
            currentExample.description = lines[i + 1].trim()
          }
          
          collectingOutput = false
        } else if (currentExample && line.trim() && !line.match(/^\s*\$/)) {
          // Collect output if it looks like output
          if (collectingOutput || line.match(/^\s{2,}/)) {
            currentExample.output = (currentExample.output || '') + line + '\n'
            collectingOutput = true
          }
        }
      }
      
      if (currentExample) {
        examples.push(currentExample)
      }
    }
    
    return examples
  }

  /**
   * Extract tags from example commands
   */
  private static extractExampleTags(command: string): string[] {
    const tags: string[] = []
    
    if (command.includes('|')) tags.push('pipe')
    if (command.includes('>') || command.includes('>>')) tags.push('redirect')
    if (command.includes('*') || command.includes('?')) tags.push('glob')
    if (command.includes('$(') || command.includes('`')) tags.push('substitution')
    if (command.includes('sudo')) tags.push('admin')
    
    return tags
  }

  /**
   * Extract relationships and see also references
   */
  private static extractRelationships(content: string): {
    relatedCommands: string[]
    seeAlso: Array<{ name: string; section: number }>
  } {
    const relatedSet = new Set<string>()
    const seeAlsoList: Array<{ name: string; section: number }> = []
    
    // Extract from SEE ALSO section
    const seeAlsoSection = content.match(/SEE ALSO\s+([\s\S]+?)(?=\n[A-Z]+\s*\n|$)/i)
    if (seeAlsoSection) {
      const matches = seeAlsoSection[1].matchAll(this.PATTERNS.seeAlso)
      for (const match of matches) {
        seeAlsoList.push({
          name: match[1],
          section: parseInt(match[2])
        })
        relatedSet.add(match[1])
      }
    }
    
    // Extract commands mentioned in content
    const commandMatches = content.matchAll(/\b([a-z][a-z0-9_-]{2,})\b/gi)
    for (const match of commandMatches) {
      if (this.isLikelyCommand(match[1])) {
        relatedSet.add(match[1])
      }
    }
    
    return {
      relatedCommands: Array.from(relatedSet).slice(0, 15),
      seeAlso: seeAlsoList
    }
  }

  /**
   * Generate keywords for search optimization
   */
  private static generateKeywords(
    name: string,
    title: string,
    description: string,
    sections: ManPageSection[]
  ): string[] {
    const keywords = new Set<string>()
    
    // Add name variations
    keywords.add(name)
    if (name.includes('-')) {
      keywords.add(name.replace(/-/g, ''))
    }
    
    // Extract key terms from title and description
    const words = (title + ' ' + description)
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3 && !this.isStopWord(w))
    
    words.forEach(w => keywords.add(w))
    
    // Add section-specific keywords
    for (const section of sections) {
      if (section.title.match(/OPTION|FLAG|COMMAND/i)) {
        section.content
          .match(/-{1,2}[a-zA-Z][-a-zA-Z0-9]*/g)
          ?.forEach(flag => keywords.add(flag))
      }
    }
    
    return Array.from(keywords).slice(0, 20)
  }

  /**
   * Determine command complexity
   */
  private static determineComplexity(
    name: string,
    flagCount: number,
    exampleCount: number
  ): 'basic' | 'intermediate' | 'advanced' {
    if (this.COMMAND_COMPLEXITY.basic.has(name)) return 'basic'
    if (this.COMMAND_COMPLEXITY.advanced.has(name)) return 'advanced'
    if (this.COMMAND_COMPLEXITY.intermediate.has(name)) return 'intermediate'
    
    // Heuristic based on content
    if (flagCount < 5 && exampleCount < 3) return 'basic'
    if (flagCount > 20 || exampleCount > 10) return 'advanced'
    return 'intermediate'
  }

  /**
   * Enhanced search content generation
   */
  private static generateSearchContent(data: {
    name: string
    title: string
    description: string
    synopsis: string
    sections: ManPageSection[]
    examples: ManPageExample[]
    flags: ManPageFlag[]
    keywords: string[]
  }): string {
    const parts = [
      data.name,
      data.title,
      data.description,
      data.synopsis,
      ...data.keywords,
      ...data.flags.map(f => `${f.flag} ${f.description}`),
      ...data.examples.map(e => `${e.command} ${e.description}`),
      ...data.sections.map(s => `${s.title} ${s.content.slice(0, 200)}`)
    ]
    
    return parts
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Helper methods
  private static extractSection(content: string): number {
    const match = content.match(/^(\w+)\((\d)\)/)
    return match ? parseInt(match[2]) : 1
  }

  private static extractTitle(content: string, name: string): string {
    const lines = content.split('\n')
    const nameIndex = lines.findIndex(line => line.includes('NAME'))
    
    if (nameIndex >= 0 && nameIndex + 1 < lines.length) {
      const nextLine = lines[nameIndex + 1]
      const match = nextLine.match(/^\s*\S+\s+-\s+(.+)$/)
      if (match) return match[1].trim()
    }
    
    return `${name} manual page`
  }

  private static extractDescription(content: string): string {
    const descMatch = content.match(/DESCRIPTION\s+([\s\S]{1,500}?)(?=\n\s*\n|\n[A-Z])/i)
    if (descMatch) {
      return descMatch[1]
        .trim()
        .replace(/\s+/g, ' ')
        .split(/[.!?]/)[0] + '.'
    }
    
    return this.extractTitle(content, '')
  }

  private static extractSynopsis(content: string): string {
    const synopsisMatch = content.match(/SYNOPSIS\s+([\s\S]+?)(?=\n[A-Z]+\s*\n|$)/i)
    
    if (synopsisMatch) {
      return synopsisMatch[1]
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\\f[BR]/g, '')
    }
    
    return ''
  }

  private static parseSections(content: string): ManPageSection[] {
    const sections: ManPageSection[] = []
    const lines = content.split('\n')
    
    let currentSection: ManPageSection | null = null
    let contentBuffer: string[] = []
    let codeBlockBuffer: string[] = []
    let inCodeBlock = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // Check for main section header
      const sectionMatch = line.match(/^([A-Z][A-Z\s]+)$/)
      if (sectionMatch && !inCodeBlock) {
        // Save previous section
        if (currentSection) {
          currentSection.content = contentBuffer.join('\n').trim()
          if (codeBlockBuffer.length > 0) {
            currentSection.codeBlocks = [codeBlockBuffer.join('\n')]
            codeBlockBuffer = []
          }
          sections.push(currentSection)
        }
        
        // Start new section
        currentSection = {
          id: sectionMatch[1].toLowerCase().replace(/\s+/g, '-'),
          title: sectionMatch[1],
          content: '',
          level: 1,
          subsections: [],
          codeBlocks: []
        }
        contentBuffer = []
        continue
      }
      
      // Check for code blocks (indented lines)
      if (line.match(/^\s{4,}/) && currentSection) {
        if (!inCodeBlock) {
          if (contentBuffer.length > 0) {
            currentSection.content = contentBuffer.join('\n').trim()
            contentBuffer = []
          }
          inCodeBlock = true
        }
        codeBlockBuffer.push(line.trimEnd())
      } else if (inCodeBlock && line.trim() === '') {
        // Empty line in code block
        codeBlockBuffer.push('')
      } else if (inCodeBlock && !line.match(/^\s{4,}/)) {
        // End of code block
        if (codeBlockBuffer.length > 0 && currentSection) {
          currentSection.codeBlocks!.push(codeBlockBuffer.join('\n'))
          codeBlockBuffer = []
        }
        inCodeBlock = false
        contentBuffer.push(line)
      } else {
        // Regular content
        contentBuffer.push(line)
      }
    }
    
    // Save last section
    if (currentSection) {
      currentSection.content = contentBuffer.join('\n').trim()
      if (codeBlockBuffer.length > 0) {
        currentSection.codeBlocks = [codeBlockBuffer.join('\n')]
      }
      sections.push(currentSection)
    }
    
    return sections
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

  private static isCommonCommand(name: string): boolean {
    const allCommon = new Set([
      ...this.COMMAND_COMPLEXITY.basic,
      ...this.COMMAND_COMPLEXITY.intermediate
    ])
    return allCommon.has(name)
  }

  private static isLikelyCommand(word: string): boolean {
    // Simple heuristic to check if a word is likely a command
    return /^[a-z][a-z0-9_-]{2,}$/.test(word) &&
           !this.isStopWord(word) &&
           word.length <= 15
  }

  private static isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
      'that', 'this', 'with', 'from', 'can', 'may', 'will',
      'one', 'two', 'three', 'file', 'files', 'user', 'system'
    ])
    return stopWords.has(word.toLowerCase())
  }

  /**
   * Parse all available man pages with enhanced features
   */
  static async parseAllAvailable(options: {
    sections?: number[]
    limit?: number
    onProgress?: (name: string, index: number, total: number) => void
    priorityCommands?: string[]
  } = {}): Promise<EnhancedManPage[]> {
    const { 
      sections = [1, 2, 3, 4, 5, 6, 7, 8], 
      limit, 
      onProgress,
      priorityCommands = []
    } = options
    
    const pages: EnhancedManPage[] = []
    const processed = new Set<string>()
    
    // Process priority commands first
    for (const command of priorityCommands) {
      if (processed.has(command)) continue
      
      const page = await this.parseFromSystem(command)
      if (page) {
        pages.push(page)
        processed.add(command)
        
        if (onProgress) {
          onProgress(command, pages.length, limit || 1000)
        }
      }
    }
    
    // Process remaining commands by section
    for (const section of sections) {
      try {
        const { stdout } = await execAsync(`man -k . -s ${section} 2>/dev/null | cut -d' ' -f1 | sort -u`)
        const commands = stdout
          .split('\n')
          .filter(cmd => cmd && !processed.has(cmd))
        
        for (const command of commands) {
          if (limit && pages.length >= limit) {
            return pages
          }
          
          processed.add(command)
          
          if (onProgress) {
            onProgress(command, pages.length + 1, limit || commands.length)
          }
          
          const page = await this.parseFromSystem(command, section)
          if (page) {
            pages.push(page)
          }
        }
      } catch (error) {
        console.error(`Failed to list man pages for section ${section}:`, error)
      }
    }
    
    return pages
  }
}