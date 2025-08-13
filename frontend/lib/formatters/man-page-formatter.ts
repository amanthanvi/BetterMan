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
      .replace(/^[A-Z]+\(\d+\)\s+.*?\s+[A-Z]+\(\d+\)$/gm, '')
      // Remove excessive whitespace between sections
      .replace(/\n{3,}/g, '\n\n')
      // Clean up weird spacing in headers
      .replace(/^([A-Z\s]+)$/gm, (match) => {
        // Check if it's a section header (all caps, possibly with spaces)
        const cleaned = match.replace(/\s+/g, ' ').trim()
        if (cleaned.match(/^[A-Z][A-Z\s]+$/)) {
          return cleaned
        }
        return match
      })
      // Remove page break artifacts
      .replace(/\f/g, '')
      // Normalize whitespace
      .replace(/[ \t]+/g, ' ')
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
    // Match option patterns like "-a, --all" or "--option=VALUE"
    const optionRegex = /^(\s*)(-[\w-]+(?:,\s*--[\w-]+)?(?:\[?=[\w\[\]]+\]?)?)/gm
    
    const formattedContent = content
      .replace(optionRegex, (match, indent, option) => {
        return `${indent}<span class="option-flag">${this.escapeHtml(option)}</span>`
      })
    
    return {
      title,
      content: this.formatSectionContent(formattedContent)
    }
  }
  
  /**
   * Format EXAMPLES section with code blocks
   */
  private static formatExamplesSection(title: string, content: string): FormattedSection {
    // Detect code examples (usually indented lines)
    const lines = content.split('\n')
    const formattedLines: string[] = []
    let inCodeBlock = false
    let codeLines: string[] = []
    
    for (const line of lines) {
      const isIndented = line.startsWith('       ') || line.startsWith('\t')
      
      if (isIndented && !inCodeBlock) {
        // Start code block
        inCodeBlock = true
        codeLines = [line.trim()]
      } else if (isIndented && inCodeBlock) {
        // Continue code block
        codeLines.push(line.trim())
      } else if (!isIndented && inCodeBlock) {
        // End code block
        formattedLines.push(`<pre class="code-example"><code>${codeLines.join('\n')}</code></pre>`)
        formattedLines.push(this.escapeHtml(line))
        inCodeBlock = false
        codeLines = []
      } else {
        // Regular text
        formattedLines.push(this.escapeHtml(line))
      }
    }
    
    // Handle any remaining code block
    if (inCodeBlock && codeLines.length > 0) {
      formattedLines.push(`<pre class="code-example"><code>${codeLines.join('\n')}</code></pre>`)
    }
    
    return {
      title,
      content: formattedLines.join('\n')
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