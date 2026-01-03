/**
 * Enhanced man page content formatter
 * Properly formats raw man page text for display
 */

export interface FormattedSection {
  title: string
  content: string
  subsections?: FormattedSection[]
}

export class ManPageFormatter {
  /**
   * Format raw man page content into structured sections
   */
  static formatContent(rawContent: string): FormattedSection[] {
    if (!rawContent) return []
    
    // Clean up the content first
    const cleanedContent = this.cleanContent(rawContent)
    
    // Parse into sections
    const sections = this.parseSections(cleanedContent)
    
    return sections
  }
  
  /**
   * Clean raw man page content
   */
  private static cleanContent(content: string): string {
    return content
      // Remove header/footer lines (e.g., "LS(1)    User Commands    LS(1)")
      .replace(/^[A-Z]+[\(\[]\d+[\)\]]\s+.*?\s+[A-Z]+[\(\[]\d+[\)\]]$/gm, '')
      // Remove man page headers/footers with dates
      .replace(/^\w+\s+\d{4}-\d{2}-\d{2}\s+.*$/gm, '')
      // Remove groff escape sequences
      .replace(/\\f[BIRP]/g, '') // Font changes
      .replace(/\\&/g, '') // Zero-width space
      .replace(/\\-/g, '-') // Hyphen
      .replace(/\\'/g, "'") // Apostrophe
      .replace(/\\"/g, '"') // Quote
      .replace(/\\e/g, '\\') // Backslash
      .replace(/\\\^/g, '') // Half-narrow space
      .replace(/\\\|/g, '') // Sixth of em space
      .replace(/\\0/g, ' ') // Digital space
      .replace(/\\~/g, ' ') // Unbreakable space
      .replace(/\.\\".*$/gm, '') // Comments
      // Remove excessive whitespace between sections
      .replace(/\n{3,}/g, '\n\n')
      // Clean up weird spacing in headers
      .replace(/^([A-Z\s]+)$/gm, (match) => {
        // Check if it's a section header (all caps, possibly with spaces)
        const cleaned = match.replace(/\s+/g, ' ').trim()
        if (cleaned.match(/^[A-Z][A-Z\s]*$/)) {
          return cleaned
        }
        return match
      })
      // Remove page break artifacts
      .replace(/\f/g, '')
      // Normalize whitespace
      .replace(/[ \t]+/g, ' ')
      // Remove leading/trailing whitespace from lines
      .split('\n').map(line => line.trim()).join('\n')
      // Remove empty lines at start/end
      .replace(/^\n+|\n+$/g, '')
      .trim()
  }
  
  /**
   * Parse content into sections
   */
  private static parseSections(content: string): FormattedSection[] {
    const sections: FormattedSection[] = []
    
    // Common man page section headers
    const sectionHeaders = [
      'NAME',
      'SYNOPSIS',
      'DESCRIPTION',
      'OPTIONS',
      'ARGUMENTS',
      'EXAMPLES',
      'EXIT STATUS',
      'RETURN VALUE',
      'ERRORS',
      'ENVIRONMENT',
      'FILES',
      'VERSIONS',
      'CONFORMING TO',
      'NOTES',
      'BUGS',
      'AUTHOR',
      'AUTHORS',
      'REPORTING BUGS',
      'COPYRIGHT',
      'SEE ALSO',
      'HISTORY',
      'AVAILABILITY',
      'STANDARDS',
      'COMMANDS',
      'FUNCTIONS',
      'LIBRARY',
      'DIAGNOSTICS'
    ]
    
    // Create regex to match section headers
    const headerRegex = new RegExp(
      `^(${sectionHeaders.join('|')})\\s*$`,
      'gmi'
    )
    
    // Split content by section headers
    const parts = content.split(headerRegex)
    
    // Process each section
    for (let i = 1; i < parts.length; i += 2) {
      const title = parts[i].trim()
      const sectionContent = parts[i + 1]?.trim() || ''
      
      if (title && sectionContent) {
        const formattedSection = this.formatSection(title, sectionContent)
        sections.push(formattedSection)
      }
    }
    
    // If no sections found, treat entire content as description
    if (sections.length === 0 && content.trim()) {
      sections.push({
        title: 'DESCRIPTION',
        content: this.formatSectionContent(content)
      })
    }
    
    return sections
  }
  
  /**
   * Format a single section
   */
  private static formatSection(title: string, content: string): FormattedSection {
    // Special formatting for different section types
    switch (title.toUpperCase()) {
      case 'OPTIONS':
        return this.formatOptionsSection(title, content)
      case 'EXAMPLES':
        return this.formatExamplesSection(title, content)
      case 'SEE ALSO':
        return this.formatSeeAlsoSection(title, content)
      default:
        return {
          title,
          content: this.formatSectionContent(content)
        }
    }
  }
  
  /**
   * Format OPTIONS section with proper structure
   */
  private static formatOptionsSection(title: string, content: string): FormattedSection {
    // Split into individual option blocks
    const lines = content.split('\n')
    const options: string[] = []
    let currentOption = ''
    let inOption = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Check if this line starts a new option (starts with - or --)
      if (line.match(/^\s*-{1,2}[\w-]/)) {
        if (currentOption) {
          options.push(currentOption)
        }
        currentOption = line
        inOption = true
      } else if (inOption) {
        // Continue the current option description
        if (line.trim()) {
          currentOption += '\n' + line
        } else if (currentOption) {
          // Empty line ends the option
          options.push(currentOption)
          currentOption = ''
          inOption = false
        }
      }
    }
    
    // Don't forget the last option
    if (currentOption) {
      options.push(currentOption)
    }
    
    // Format each option
    const formattedOptions = options.map(opt => {
      const lines = opt.split('\n')
      const firstLine = lines[0]
      const description = lines.slice(1).join(' ').trim()
      
      // Extract the option flag(s)
      const flagMatch = firstLine.match(/^\s*(.+?)\s*$/)
      const flag = flagMatch ? flagMatch[1] : firstLine
      
      return `<div class="option-item mb-4 pl-4 border-l-2 border-primary/20">
        <div class="font-mono text-primary font-semibold">${this.escapeHtml(flag)}</div>
        ${description ? `<div class="text-sm mt-1 text-muted-foreground">${this.escapeHtml(description)}</div>` : ''}
      </div>`
    }).join('\n')
    
    return {
      title,
      content: `<div class="options-list">${formattedOptions}</div>`
    }
  }
  
  /**
   * Format EXAMPLES section with code blocks
   */
  private static formatExamplesSection(title: string, content: string): FormattedSection {
    // Detect code examples (usually indented lines or lines starting with $)
    const lines = content.split('\n')
    const examples: { description?: string; command: string }[] = []
    let currentExample: { description?: string; command: string } | null = null
    let collectingCommand = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const nextLine = lines[i + 1]
      
      // Check if this is a command line (starts with $ or is indented)
      const isCommand = line.trim().startsWith('$') || line.trim().startsWith('#') || 
                       (line.startsWith('       ') || line.startsWith('\t'))
      
      if (isCommand) {
        const command = line.trim().replace(/^\$\s*/, '').replace(/^#\s*/, '')
        if (currentExample && !collectingCommand) {
          // This is a new command after a description
          currentExample.command = command
          collectingCommand = true
        } else if (!currentExample) {
          // Command without description
          currentExample = { command }
          collectingCommand = true
        } else if (collectingCommand) {
          // Multi-line command
          currentExample.command += '\n' + command
        }
      } else if (line.trim() === '') {
        // Empty line - end current example if we have one
        if (currentExample && currentExample.command) {
          examples.push(currentExample)
          currentExample = null
          collectingCommand = false
        }
      } else if (!collectingCommand && line.trim()) {
        // This is a description
        if (currentExample && currentExample.command) {
          examples.push(currentExample)
        }
        currentExample = { description: line.trim(), command: '' }
        collectingCommand = false
      }
    }
    
    // Don't forget the last example
    if (currentExample && currentExample.command) {
      examples.push(currentExample)
    }
    
    // Format the examples
    const formattedExamples = examples.map((ex, idx) => `
      <div class="example-block mb-6 p-4 rounded-lg border border-border/50 bg-card/50">
        ${ex.description ? `<p class="text-sm mb-2">${this.escapeHtml(ex.description)}</p>` : ''}
        <pre class="bg-muted/50 p-3 rounded overflow-x-auto"><code class="text-sm font-mono">${this.escapeHtml(ex.command)}</code></pre>
      </div>
    `).join('\n')
    
    return {
      title,
      content: formattedExamples || '<p class="text-muted-foreground">No examples available.</p>'
    }
  }
  
  /**
   * Format SEE ALSO section with links
   */
  private static formatSeeAlsoSection(title: string, content: string): FormattedSection {
    // Match man page references like "ls(1)" or "grep(1)"
    const manPageRegex = /(\w+)\((\d+)\)/g
    
    const formattedContent = content.replace(manPageRegex, (match, name, section) => {
      return `<a href="/docs/${name}.${section}" class="man-page-link">${match}</a>`
    })
    
    return {
      title,
      content: this.formatSectionContent(formattedContent)
    }
  }
  
  /**
   * Format general section content
   */
  private static formatSectionContent(content: string): string {
    // Skip if already contains HTML
    if (content.includes('<') && content.includes('>')) {
      return content
    }
    
    return this.escapeHtml(content)
      // Format options/flags
      .replace(/\b(-{1,2}[a-zA-Z][-a-zA-Z0-9]*)\b/g, '<span class="text-primary font-mono">$1</span>')
      // Format file paths
      .replace(/\b(\/[\w\-\/\.]+)\b/g, '<span class="text-accent font-mono">$1</span>')
      // Format environment variables
      .replace(/\b([A-Z_]+[A-Z0-9_]*)\b/g, (match) => {
        // Only format if it looks like an env var (all caps with underscores)
        if (match.match(/^[A-Z][A-Z0-9_]{2,}$/)) {
          return `<span class="text-warning font-mono">${match}</span>`
        }
        return match
      })
      // Format inline code (backticks)
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
      // Convert line breaks to proper paragraphs
      .split('\n\n')
      .map(para => `<p class="mb-4">${para.replace(/\n/g, '<br>')}</p>`)
      .join('\n')
  }
  
  /**
   * Escape HTML special characters
   */
  private static escapeHtml(text: string): string {
    // Check if we're in a Node/SSR environment
    if (typeof document === 'undefined') {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
    }
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

/**
 * Format raw man page content for display
 */
export function formatManPageContent(content: string): string {
  const sections = ManPageFormatter.formatContent(content)
  
  // Convert sections to HTML
  const html = sections.map(section => `
    <section class="man-section mb-8">
      <h2 class="text-xl font-bold mb-4 text-primary">${section.title}</h2>
      <div class="man-section-content">
        ${section.content}
      </div>
    </section>
  `).join('\n')
  
  return html
}