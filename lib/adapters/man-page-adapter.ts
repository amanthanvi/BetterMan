import type { ManPage } from '../parser/man-parser'
import type { EnhancedManPage, ManPageFlag, ManPageExample } from '../parser/enhanced-man-parser'

/**
 * Adapts basic ManPage format to EnhancedManPage format
 * This allows the enhanced viewer to work with both data structures
 */
export function adaptManPageToEnhanced(page: Partial<ManPage> & Pick<ManPage, 'name' | 'section' | 'title'>): EnhancedManPage {
  // Parse flags from OPTIONS section if available
  const flags = parseFlags(page.sections?.find(s => s.title === 'OPTIONS')?.content || '')
  
  // Parse examples into enhanced format
  const examples = parseExamples(page.examples || [])
  
  // Extract metadata from content
  const metadata = {
    date: new Date().toISOString(),
    source: 'System Manual',
    manual: `Section ${page.section}`,
  }
  
  // Determine complexity based on content
  const complexity = determineComplexity(page.name || '', flags.length, examples.length)
  
  // Build enhanced page structure
  const enhancedPage: EnhancedManPage = {
    name: page.name,
    section: page.section,
    title: page.title,
    description: page.description || '',
    synopsis: page.synopsis || '',
    category: page.category || getCategoryName(page.section),
    sections: page.sections || [],
    flags,
    examples,
    relatedCommands: page.relatedCommands || [],
    seeAlso: (() => {
      if (page.seeAlso && Array.isArray(page.seeAlso)) {
        // Check if it's already in the new format
        if (page.seeAlso.length > 0 && typeof page.seeAlso[0] === 'object' && 'name' in page.seeAlso[0]) {
          return page.seeAlso as Array<{ name: string; section: number }>
        }
        // Convert from string array
        return (page.seeAlso as string[]).map(cmd => ({
          name: cmd,
          section: 1
        }))
      }
      // Fallback to related commands
      return (page.relatedCommands || []).map(cmd => ({
        name: cmd,
        section: 1
      }))
    })(),
    metadata,
    searchContent: page.searchContent || '',
    keywords: extractKeywords(page),
    complexity,
    hash: generateHash(JSON.stringify(page)),
    parsedAt: new Date().toISOString(),
    parseVersion: '1.0.0',
    isCommon: page.isCommon || false,
    hasInteractiveExamples: false,
    hasDiagrams: false,
  }
  
  return enhancedPage
}

/**
 * Parse flags from OPTIONS section content
 */
function parseFlags(content: string): ManPageFlag[] {
  if (!content) return []
  
  const flags: ManPageFlag[] = []
  const lines = content.split('\n')
  let currentFlag: Partial<ManPageFlag> | null = null
  
  for (const line of lines) {
    const flagMatch = line.match(/^\s*(-{1,2}[a-zA-Z][-a-zA-Z0-9]*)\s*(?:,\s*(-{1,2}[a-zA-Z][-a-zA-Z0-9]*))?\s*(.*)$/)
    
    if (flagMatch) {
      // Save previous flag if exists
      if (currentFlag && currentFlag.flag) {
        flags.push(currentFlag as ManPageFlag)
      }
      
      // Start new flag
      const [, flag1, flag2, desc] = flagMatch
      currentFlag = {
        flag: flag2 || flag1, // Prefer long flag
        shortFlag: flag2 ? flag1 : undefined,
        description: desc.trim(),
      }
    } else if (currentFlag && line.trim()) {
      // Continue description
      currentFlag.description += ' ' + line.trim()
    }
  }
  
  // Add last flag
  if (currentFlag && currentFlag.flag) {
    flags.push(currentFlag as ManPageFlag)
  }
  
  return flags
}

/**
 * Parse examples into enhanced format
 */
function parseExamples(examples: string[]): ManPageExample[] {
  return examples.map(example => {
    const command = example.replace(/^\$\s*/, '').trim()
    
    return {
      command,
      description: `Example usage of ${command.split(' ')[0]}`,
      tags: extractExampleTags(command),
    }
  })
}

/**
 * Extract tags from example command
 */
function extractExampleTags(command: string): string[] {
  const tags: string[] = []
  
  if (command.includes('|')) tags.push('pipe')
  if (command.includes('>') || command.includes('>>')) tags.push('redirect')
  if (command.includes('*') || command.includes('?')) tags.push('glob')
  if (command.includes('$(') || command.includes('`')) tags.push('substitution')
  if (command.includes('sudo')) tags.push('admin')
  if (command.includes('-')) tags.push('options')
  
  return tags
}

/**
 * Extract keywords from page content
 */
function extractKeywords(page: Partial<ManPage>): string[] {
  const keywords = new Set<string>()
  
  // Add command name
  if (page.name) {
    keywords.add(page.name)
  }
  
  // Extract from title
  if (page.title) {
    page.title.split(/\s+/).forEach(word => {
      if (word.length > 3) keywords.add(word.toLowerCase())
    })
  }
  
  // Extract from description
  if (page.description) {
    const words = page.description.toLowerCase().split(/\s+/)
    words.filter(w => w.length > 4 && !isStopWord(w)).forEach(w => keywords.add(w))
  }
  
  // Add category keywords
  if (page.category) {
    keywords.add(page.category.toLowerCase())
  }
  
  // Add related commands
  if (page.relatedCommands) {
    page.relatedCommands.forEach(cmd => keywords.add(cmd))
  }
  
  return Array.from(keywords).slice(0, 20)
}

/**
 * Determine command complexity
 */
function determineComplexity(name: string, flagCount: number, exampleCount: number): 'basic' | 'intermediate' | 'advanced' {
  const basicCommands = new Set(['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'touch'])
  const advancedCommands = new Set(['git', 'docker', 'systemctl', 'iptables', 'sed', 'awk'])
  
  if (basicCommands.has(name)) return 'basic'
  if (advancedCommands.has(name)) return 'advanced'
  
  // Heuristic based on content
  if (flagCount < 5 && exampleCount < 3) return 'basic'
  if (flagCount > 15 || exampleCount > 8) return 'advanced'
  
  return 'intermediate'
}

/**
 * Get category name for section number
 */
function getCategoryName(section: number): string {
  const categories: Record<number, string> = {
    1: 'User Commands',
    2: 'System Calls',
    3: 'Library Functions',
    4: 'Special Files',
    5: 'File Formats',
    6: 'Games',
    7: 'Miscellaneous',
    8: 'System Administration',
  }
  return categories[section] || 'Other'
}

/**
 * Generate hash for content
 */
function generateHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * Check if word is a stop word
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
    'that', 'this', 'with', 'from', 'can', 'may', 'will',
    'one', 'two', 'three', 'file', 'files', 'about', 'information',
  ])
  return stopWords.has(word.toLowerCase())
}