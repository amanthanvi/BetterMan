import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)

export interface ManPageSection {
  id: string
  title: string
  content: string
  level: number
  subsections?: ManPageSection[]
}

export interface SeeAlsoItem {
  name: string
  section: number
}

export interface ManPage {
  name: string
  section: number
  title: string
  description: string
  synopsis: string
  sections: ManPageSection[]
  rawContent: string
  searchContent: string
  relatedCommands: string[]
  examples: string[]
  category?: string
  isCommon?: boolean
  seeAlso?: SeeAlsoItem[]
  keywords?: string[]
}

export class ManPageParser {
  private static readonly SECTION_REGEX = /^\.SH\s+"?([^"]+)"?$/gm
  private static readonly SUBSECTION_REGEX = /^\.SS\s+"?([^"]+)"?$/gm
  private static readonly COMMAND_REGEX = /\\fB([a-z0-9_-]+)\\fR(?:\((\d)\))?/gi
  private static readonly EXAMPLE_REGEX = /^\s*\$\s*.+$/gm
  
  private static readonly COMMON_COMMANDS = new Set([
    'ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'grep',
    'find', 'sed', 'awk', 'cut', 'sort', 'uniq', 'head', 'tail', 'less',
    'man', 'chmod', 'chown', 'ps', 'kill', 'top', 'df', 'du', 'tar',
    'gzip', 'curl', 'wget', 'ssh', 'scp', 'git', 'vim', 'nano', 'make'
  ])

  private static readonly CATEGORIES = {
    1: 'User Commands',
    2: 'System Calls',
    3: 'Library Functions',
    4: 'Special Files',
    5: 'File Formats',
    6: 'Games',
    7: 'Miscellaneous',
    8: 'System Administration'
  }

  /**
   * Parse a man page from the system
   */
  static async parseFromSystem(command: string, section?: number): Promise<ManPage | null> {
    try {
      // Get raw man page content
      const sectionArg = section ? section.toString() : ''
      const { stdout: rawContent } = await execAsync(`man ${sectionArg} ${command}`)
      
      // Get formatted text for parsing
      const { stdout: formattedContent } = await execAsync(
        `man ${sectionArg} ${command} | col -b`
      )
      
      return this.parseContent(command, formattedContent, rawContent, section)
    } catch (error) {
      console.error(`Failed to parse man page for ${command}:`, error)
      return null
    }
  }

  /**
   * Parse man page content
   */
  static parseContent(
    name: string, 
    formattedContent: string, 
    rawContent: string,
    section?: number
  ): ManPage {
    // Extract basic info
    const actualSection = section || this.extractSection(formattedContent)
    const title = this.extractTitle(formattedContent, name)
    const description = this.extractDescription(formattedContent)
    const synopsis = this.extractSynopsis(formattedContent)
    
    // Parse sections
    const sections = this.parseSections(formattedContent)
    
    // Extract examples
    const examples = this.extractExamples(formattedContent)
    
    // Extract related commands
    const { relatedCommands, seeAlso } = this.extractRelatedCommands(formattedContent)
    
    // Generate search content
    const searchContent = this.generateSearchContent({
      name,
      title,
      description,
      synopsis,
      sections,
      examples
    })
    
    return {
      name,
      section: actualSection,
      title,
      description,
      synopsis,
      sections,
      rawContent,
      searchContent,
      relatedCommands,
      examples,
      seeAlso,
      category: this.CATEGORIES[actualSection as keyof typeof this.CATEGORIES],
      isCommon: this.COMMON_COMMANDS.has(name)
    }
  }

  private static extractSection(content: string): number {
    const match = content.match(/^(\w+)\((\d)\)/)
    return match ? parseInt(match[2]) : 1
  }

  private static extractTitle(content: string, name: string): string {
    const lines = content.split('\\n')
    const nameLine = lines.find(line => 
      line.includes('NAME') || line.includes(name.toUpperCase())
    )
    
    if (nameLine) {
      const nextLine = lines[lines.indexOf(nameLine) + 1]
      if (nextLine) {
        const match = nextLine.match(/^\\s*\\S+\\s+-\\s+(.+)$/)
        if (match) return match[1].trim()
      }
    }
    
    return `${name} manual page`
  }

  private static extractDescription(content: string): string {
    const descMatch = content.match(/DESCRIPTION\\s+([^\\n]+(?:\\n(?!\\w)[^\\n]+)*)/i)
    if (descMatch) {
      return descMatch[1]
        .trim()
        .replace(/\\s+/g, ' ')
        .split('.')[0] + '.'
    }
    
    return this.extractTitle(content, '')
  }

  private static extractSynopsis(content: string): string {
    const synopsisMatch = content.match(
      /SYNOPSIS\\s+([^\\n]+(?:\\n(?!\\w)[^\\n]+)*)/i
    )
    
    if (synopsisMatch) {
      return synopsisMatch[1]
        .trim()
        .replace(/\\s+/g, ' ')
        .replace(/\\\\fB/g, '')
        .replace(/\\\\fR/g, '')
    }
    
    return ''
  }

  private static parseSections(content: string): ManPageSection[] {
    const sections: ManPageSection[] = []
    const lines = content.split('\\n')
    
    let currentSection: ManPageSection | null = null
    let currentSubsection: ManPageSection | null = null
    let contentBuffer: string[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // Check for main section
      const sectionMatch = line.match(/^([A-Z][A-Z\\s]+)$/)
      if (sectionMatch) {
        // Save previous section
        if (currentSection) {
          if (currentSubsection) {
            currentSubsection.content = contentBuffer.join('\\n').trim()
            contentBuffer = []
            currentSubsection = null
          } else if (contentBuffer.length > 0) {
            currentSection.content = contentBuffer.join('\\n').trim()
            contentBuffer = []
          }
          sections.push(currentSection)
        }
        
        // Start new section
        currentSection = {
          id: sectionMatch[1].toLowerCase().replace(/\\s+/g, '-'),
          title: sectionMatch[1],
          content: '',
          level: 1,
          subsections: []
        }
        continue
      }
      
      // Check for subsection
      if (currentSection && line.match(/^\\s{2,}[A-Z][a-z\\s]+$/)) {
        if (currentSubsection) {
          currentSubsection.content = contentBuffer.join('\\n').trim()
          contentBuffer = []
        }
        
        currentSubsection = {
          id: `${currentSection.id}-${line.trim().toLowerCase().replace(/\\s+/g, '-')}`,
          title: line.trim(),
          content: '',
          level: 2
        }
        
        currentSection.subsections!.push(currentSubsection)
        continue
      }
      
      // Collect content
      if (line.trim()) {
        contentBuffer.push(line)
      }
    }
    
    // Save last section
    if (currentSection) {
      if (currentSubsection) {
        currentSubsection.content = contentBuffer.join('\\n').trim()
      } else if (contentBuffer.length > 0) {
        currentSection.content = contentBuffer.join('\\n').trim()
      }
      sections.push(currentSection)
    }
    
    return sections
  }

  private static extractExamples(content: string): string[] {
    const examples: string[] = []
    const exampleSection = content.match(
      /EXAMPLES?\\s+([\\s\\S]+?)(?=\\n[A-Z]|$)/i
    )
    
    if (exampleSection) {
      const matches = exampleSection[1].matchAll(this.EXAMPLE_REGEX)
      for (const match of matches) {
        examples.push(match[0].trim())
      }
    }
    
    return examples
  }

  private static extractRelatedCommands(content: string): { relatedCommands: string[], seeAlso: SeeAlsoItem[] } {
    const related = new Set<string>()
    const seeAlsoItems: SeeAlsoItem[] = []
    const seeAlsoSection = content.match(
      /SEE ALSO\\s+([\\s\\S]+?)(?=\\n[A-Z]|$)/i
    )
    
    if (seeAlsoSection) {
      const matches = seeAlsoSection[1].matchAll(/\\b([a-z0-9_-]+)\\((\\d)\\)/gi)
      for (const match of matches) {
        related.add(match[1])
        seeAlsoItems.push({
          name: match[1],
          section: parseInt(match[2])
        })
      }
    }
    
    // Also extract commands mentioned in the content
    const commandMatches = content.matchAll(this.COMMAND_REGEX)
    for (const match of commandMatches) {
      if (match[1].length > 1) {
        related.add(match[1])
      }
    }
    
    return {
      relatedCommands: Array.from(related).slice(0, 10),
      seeAlso: seeAlsoItems
    }
  }

  private static generateSearchContent(data: {
    name: string
    title: string
    description: string
    synopsis: string
    sections: ManPageSection[]
    examples: string[]
  }): string {
    const parts = [
      data.name,
      data.title,
      data.description,
      data.synopsis
    ]
    
    // Add section titles and content
    for (const section of data.sections) {
      parts.push(section.title)
      parts.push(section.content.slice(0, 200))
      
      if (section.subsections) {
        for (const subsection of section.subsections) {
          parts.push(subsection.title)
          parts.push(subsection.content.slice(0, 100))
        }
      }
    }
    
    // Add examples
    parts.push(...data.examples)
    
    return parts
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9\\s-]/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim()
  }

  /**
   * Parse all available man pages on the system
   */
  static async parseAllAvailable(options: {
    sections?: number[]
    limit?: number
    onProgress?: (name: string, index: number, total: number) => void
  } = {}): Promise<ManPage[]> {
    const { sections = [1, 2, 3, 4, 5, 6, 7, 8], limit, onProgress } = options
    const pages: ManPage[] = []
    const processed = new Set<string>()
    
    for (const section of sections) {
      try {
        const { stdout } = await execAsync(`man -k . -s ${section} | cut -d' ' -f1`)
        const commands = stdout
          .split('\\n')
          .filter(cmd => cmd && !processed.has(cmd))
          .slice(0, limit)
        
        for (let i = 0; i < commands.length; i++) {
          const command = commands[i]
          processed.add(command)
          
          if (onProgress) {
            onProgress(command, pages.length + 1, limit || commands.length)
          }
          
          const page = await this.parseFromSystem(command, section)
          if (page) {
            pages.push(page)
          }
          
          if (limit && pages.length >= limit) {
            return pages
          }
        }
      } catch (error) {
        console.error(`Failed to list man pages for section ${section}:`, error)
      }
    }
    
    return pages
  }
}