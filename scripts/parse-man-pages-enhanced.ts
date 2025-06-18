#!/usr/bin/env tsx

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import { EnhancedManPageParser, type EnhancedManPage } from '../lib/parser/enhanced-man-parser'

const execAsync = promisify(exec)
const DATA_DIR = path.join(process.cwd(), 'data', 'parsed-man-pages', 'json')

interface ParseResult {
  success: boolean
  command: string
  section?: number
  error?: string
  duration?: number
}

interface ParseStats {
  total: number
  successful: number
  failed: number
  duration: number
  bySection: Record<number, number>
  byCategory: Record<string, number>
  errors: string[]
}

class ManPageParser {
  private stats: ParseStats = {
    total: 0,
    successful: 0,
    failed: 0,
    duration: 0,
    bySection: {},
    byCategory: {},
    errors: []
  }

  async parseAll() {
    const startTime = Date.now()
    
    console.log('🚀 Starting enhanced man page parsing...')
    
    // Ensure output directory exists
    await fs.mkdir(DATA_DIR, { recursive: true })
    
    // Get all available man pages
    const commands = await this.getAllAvailableCommands()
    console.log(`📋 Found ${commands.length} commands to parse`)
    
    // Parse in batches for better performance
    const batchSize = 10
    const results: ParseResult[] = []
    
    for (let i = 0; i < commands.length; i += batchSize) {
      const batch = commands.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(cmd => this.parseCommand(cmd))
      )
      results.push(...batchResults)
      
      // Progress update
      const progress = Math.round((i + batch.length) / commands.length * 100)
      console.log(`📊 Progress: ${progress}% (${i + batch.length}/${commands.length})`)
    }
    
    // Calculate statistics
    this.stats.duration = Date.now() - startTime
    this.stats.total = results.length
    this.stats.successful = results.filter(r => r.success).length
    this.stats.failed = results.filter(r => !r.success).length
    
    // Save statistics
    await this.saveStatistics()
    
    console.log('\n✨ Parsing complete!')
    console.log(`📊 Total: ${this.stats.total}`)
    console.log(`✅ Successful: ${this.stats.successful}`)
    console.log(`❌ Failed: ${this.stats.failed}`)
    console.log(`⏱️  Duration: ${(this.stats.duration / 1000).toFixed(2)}s`)
  }

  private async getAllAvailableCommands(): Promise<string[]> {
    const commands = new Set<string>()
    
    try {
      // Method 1: Get from man database (most reliable)
      const { stdout: manDb } = await execAsync(
        `man -k . 2>/dev/null | cut -d' ' -f1 | cut -d'(' -f1 | sort -u`,
        { maxBuffer: 10 * 1024 * 1024 }
      )
      manDb.split('\n').filter(Boolean).forEach(cmd => commands.add(cmd))
      
      // Method 2: Get from whatis database
      try {
        const { stdout: whatisDb } = await execAsync(
          `whatis -r '.*' 2>/dev/null | cut -d' ' -f1 | sort -u`,
          { maxBuffer: 10 * 1024 * 1024 }
        )
        whatisDb.split('\n').filter(Boolean).forEach(cmd => commands.add(cmd))
      } catch {
        // whatis might not be available
      }
      
      // Method 3: Scan man directories directly
      const manDirs = [
        '/usr/share/man',
        '/usr/local/share/man',
        '/opt/local/share/man'
      ]
      
      for (const manDir of manDirs) {
        try {
          for (let section = 1; section <= 8; section++) {
            const sectionDir = path.join(manDir, `man${section}`)
            try {
              const files = await fs.readdir(sectionDir)
              files.forEach(file => {
                const match = file.match(/^([^.]+)\.(\d+)/)
                if (match) {
                  commands.add(match[1])
                }
              })
            } catch {
              // Section directory might not exist
            }
          }
        } catch {
          // Man directory might not exist
        }
      }
      
    } catch (error) {
      console.error('Error getting command list:', error)
      
      // Fallback: Use a predefined list of common commands
      const commonCommands = [
        'ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'touch',
        'grep', 'find', 'sed', 'awk', 'cut', 'sort', 'uniq', 'head', 'tail',
        'chmod', 'chown', 'ps', 'kill', 'top', 'df', 'du', 'tar', 'gzip',
        'ssh', 'scp', 'rsync', 'curl', 'wget', 'git', 'vim', 'nano', 'less',
        'man', 'which', 'whereis', 'locate', 'history', 'alias', 'export'
      ]
      commonCommands.forEach(cmd => commands.add(cmd))
    }
    
    // Filter out invalid entries
    return Array.from(commands)
      .filter(cmd => cmd && cmd.length > 0 && /^[a-zA-Z0-9._-]+$/.test(cmd))
      .sort()
  }

  private async parseCommand(command: string): Promise<ParseResult> {
    const startTime = Date.now()
    
    try {
      // Check if command has man page
      const { stdout: manPath } = await execAsync(
        `man -w "${command}" 2>/dev/null | head -1`,
        { maxBuffer: 1024 * 1024 }
      )
      
      if (!manPath || manPath.trim().length === 0) {
        return { success: false, command, error: 'No man page found' }
      }
      
      // Extract section from path
      const sectionMatch = manPath.match(/man(\d+)/)
      const section = sectionMatch ? parseInt(sectionMatch[1]) : undefined
      
      // Parse using enhanced parser
      const page = await EnhancedManPageParser.parseFromSystem(command, section)
      
      if (!page) {
        return { success: false, command, section, error: 'Failed to parse' }
      }
      
      // Validate parsed content
      if (!this.validateParsedPage(page)) {
        return { success: false, command, section, error: 'Invalid content' }
      }
      
      // Save to file
      const filename = `${page.name}.${page.section}.json`
      const filepath = path.join(DATA_DIR, filename)
      await fs.writeFile(filepath, JSON.stringify(page, null, 2))
      
      // Update statistics
      this.stats.bySection[page.section] = (this.stats.bySection[page.section] || 0) + 1
      this.stats.byCategory[page.category] = (this.stats.byCategory[page.category] || 0) + 1
      
      const duration = Date.now() - startTime
      console.log(`✅ ${command}(${page.section}) - ${page.category} - ${duration}ms`)
      
      return { success: true, command, section: page.section, duration }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.stats.errors.push(`${command}: ${errorMsg}`)
      return { success: false, command, error: errorMsg }
    }
  }

  private validateParsedPage(page: EnhancedManPage): boolean {
    // Basic validation
    if (!page.name || !page.description || !page.sections) {
      return false
    }
    
    // Description should be meaningful
    if (page.description.length < 10) {
      return false
    }
    
    // Should have at least one section
    if (page.sections.length === 0) {
      return false
    }
    
    // Check for parsing artifacts
    const hasParsingIssues = page.sections.some(section => 
      section.content.includes('\\f') || 
      section.content.includes('.SH') ||
      section.content.includes('.SS')
    )
    
    if (hasParsingIssues) {
      console.warn(`⚠️  ${page.name}: Contains parsing artifacts`)
      return false
    }
    
    return true
  }

  private async saveStatistics() {
    const manifest = {
      timestamp: new Date().toISOString(),
      parseVersion: '2.0.0',
      platform: process.platform,
      stats: this.stats,
      totalPages: this.stats.successful,
      sections: Object.entries(this.stats.bySection)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([section, count]) => ({
          section: parseInt(section),
          count,
          name: this.getSectionName(parseInt(section))
        })),
      categories: Object.entries(this.stats.byCategory)
        .sort(([, a], [, b]) => b - a)
        .map(([category, count]) => ({ category, count }))
    }
    
    const manifestPath = path.join(path.dirname(DATA_DIR), 'manifest.json')
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  }

  private getSectionName(section: number): string {
    const sectionNames: Record<number, string> = {
      1: 'User Commands',
      2: 'System Calls',
      3: 'Library Functions',
      4: 'Special Files',
      5: 'File Formats',
      6: 'Games',
      7: 'Miscellaneous',
      8: 'System Administration'
    }
    return sectionNames[section] || 'Other'
  }
}

// Run the parser
if (import.meta.url === `file://${process.argv[1]}`) {
  const parser = new ManPageParser()
  parser.parseAll().catch(console.error)
}