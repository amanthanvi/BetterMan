#!/usr/bin/env tsx

import { EnhancedManPageParser, type EnhancedManPage } from '../lib/parser/enhanced-man-parser'
import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { performance } from 'perf_hooks'

const DATA_DIR = path.join(process.cwd(), 'data', 'man-pages')
const INDEX_DIR = path.join(process.cwd(), 'data', 'indexes')
const CACHE_FILE = path.join(DATA_DIR, '.enhanced-cache-manifest.json')

interface CacheManifest {
  version: string
  parseVersion: string
  parsedAt: string
  totalPages: number
  totalSize: number
  pages: {
    [key: string]: {
      hash: string
      parsedAt: string
      size: number
      complexity: string
    }
  }
}

interface ParseStatistics {
  totalCommands: number
  parsedCount: number
  skippedCount: number
  errorCount: number
  totalTime: number
  averageParseTime: number
  complexityBreakdown: {
    basic: number
    intermediate: number
    advanced: number
  }
  sectionBreakdown: Record<number, number>
}

// Priority commands organized by category
const PRIORITY_COMMANDS = {
  essential: [
    'ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'touch',
    'chmod', 'chown', 'man', 'which', 'clear', 'exit', 'history'
  ],
  fileOperations: [
    'find', 'grep', 'sed', 'awk', 'cut', 'sort', 'uniq', 'head', 'tail',
    'less', 'more', 'wc', 'diff', 'patch', 'tree', 'du', 'df'
  ],
  processManagement: [
    'ps', 'top', 'htop', 'kill', 'killall', 'jobs', 'fg', 'bg', 'nohup',
    'nice', 'renice', 'pgrep', 'pkill', 'lsof', 'strace'
  ],
  networking: [
    'curl', 'wget', 'ssh', 'scp', 'rsync', 'netstat', 'ss', 'ping',
    'traceroute', 'dig', 'nslookup', 'host', 'ifconfig', 'ip'
  ],
  systemAdmin: [
    'sudo', 'su', 'systemctl', 'service', 'journalctl', 'cron', 'crontab',
    'mount', 'umount', 'fdisk', 'mkfs', 'fsck', 'passwd', 'useradd'
  ],
  development: [
    'git', 'make', 'gcc', 'g++', 'python', 'node', 'npm', 'docker',
    'docker-compose', 'vim', 'vi', 'nano', 'emacs', 'tmux', 'screen'
  ],
  archiving: [
    'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'bzip2', 'bunzip2', 'xz',
    '7z', 'rar', 'unrar'
  ],
  textProcessing: [
    'tr', 'tee', 'paste', 'join', 'comm', 'column', 'expand', 'unexpand',
    'fmt', 'fold', 'pr', 'nl'
  ]
}

async function loadCacheManifest(): Promise<CacheManifest | null> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function saveCacheManifest(manifest: CacheManifest) {
  await fs.writeFile(CACHE_FILE, JSON.stringify(manifest, null, 2))
}

async function createSearchIndex(pages: EnhancedManPage[]) {
  console.log('\n📚 Building search indexes...')
  
  // Create inverted index for full-text search
  const invertedIndex: Record<string, Set<string>> = {}
  const commandIndex: Record<string, any> = {}
  
  for (const page of pages) {
    const key = `${page.name}.${page.section}`
    
    // Build command index with essential info
    commandIndex[key] = {
      name: page.name,
      section: page.section,
      title: page.title,
      description: page.description,
      category: page.category,
      complexity: page.complexity,
      flags: page.flags.map(f => ({
        flag: f.flag,
        shortFlag: f.shortFlag,
        description: f.description
      })),
      popularity: page.popularity || 0,
      isCommon: page.isCommon
    }
    
    // Build inverted index from search content
    const words = page.searchContent.split(/\s+/)
    for (const word of words) {
      if (word.length > 2) {
        if (!invertedIndex[word]) {
          invertedIndex[word] = new Set()
        }
        invertedIndex[word].add(key)
      }
    }
  }
  
  // Convert sets to arrays for JSON serialization
  const serializedIndex: Record<string, string[]> = {}
  for (const [word, pages] of Object.entries(invertedIndex)) {
    serializedIndex[word] = Array.from(pages)
  }
  
  // Save indexes
  await fs.mkdir(INDEX_DIR, { recursive: true })
  
  await fs.writeFile(
    path.join(INDEX_DIR, 'inverted-index.json'),
    JSON.stringify(serializedIndex)
  )
  
  await fs.writeFile(
    path.join(INDEX_DIR, 'command-index.json'),
    JSON.stringify(commandIndex, null, 2)
  )
  
  // Create category index
  const categoryIndex: Record<string, string[]> = {}
  for (const page of pages) {
    const key = `${page.name}.${page.section}`
    if (!categoryIndex[page.category]) {
      categoryIndex[page.category] = []
    }
    categoryIndex[page.category].push(key)
  }
  
  await fs.writeFile(
    path.join(INDEX_DIR, 'category-index.json'),
    JSON.stringify(categoryIndex, null, 2)
  )
  
  // Create complexity index
  const complexityIndex: Record<string, string[]> = {
    basic: [],
    intermediate: [],
    advanced: []
  }
  
  for (const page of pages) {
    const key = `${page.name}.${page.section}`
    complexityIndex[page.complexity].push(key)
  }
  
  await fs.writeFile(
    path.join(INDEX_DIR, 'complexity-index.json'),
    JSON.stringify(complexityIndex, null, 2)
  )
  
  console.log('✅ Search indexes built successfully')
}

async function generateTypeScriptDefinitions(pages: EnhancedManPage[]) {
  console.log('\n🔧 Generating TypeScript definitions...')
  
  const commandNames = pages.map(p => p.name).sort()
  const uniqueCommands = [...new Set(commandNames)]
  
  const typeDefinition = `// Auto-generated TypeScript definitions for man pages
// Generated at: ${new Date().toISOString()}

export type ManPageName = ${uniqueCommands.map(c => `'${c}'`).join(' | ')}

export type ManPageSection = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export type ManPageComplexity = 'basic' | 'intermediate' | 'advanced'

export type ManPageCategory = 
  | 'User Commands'
  | 'System Calls'
  | 'Library Functions'
  | 'Special Files'
  | 'File Formats'
  | 'Games'
  | 'Miscellaneous'
  | 'System Administration'

export interface ManPageMetadata {
  name: ManPageName
  section: ManPageSection
  title: string
  description: string
  category: ManPageCategory
  complexity: ManPageComplexity
  isCommon: boolean
}
`
  
  await fs.writeFile(
    path.join(DATA_DIR, 'types.d.ts'),
    typeDefinition
  )
  
  console.log('✅ TypeScript definitions generated')
}

async function parseAndSaveAllManPages() {
  const startTime = performance.now()
  console.log('🚀 Starting comprehensive man page parsing...')
  console.log('⚡ Using Enhanced Parser v2.0.0\n')
  
  // Ensure directories exist
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.mkdir(INDEX_DIR, { recursive: true })
  
  // Load cache manifest
  const manifest = await loadCacheManifest() || {
    version: '2.0',
    parseVersion: '2.0.0',
    parsedAt: new Date().toISOString(),
    totalPages: 0,
    totalSize: 0,
    pages: {}
  }
  
  const stats: ParseStatistics = {
    totalCommands: 0,
    parsedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    totalTime: 0,
    averageParseTime: 0,
    complexityBreakdown: { basic: 0, intermediate: 0, advanced: 0 },
    sectionBreakdown: {}
  }
  
  const allPages: EnhancedManPage[] = []
  const parseTimes: number[] = []
  
  // Parse priority commands by category
  for (const [category, commands] of Object.entries(PRIORITY_COMMANDS)) {
    console.log(`\n📋 Parsing ${category} commands...`)
    
    for (const command of commands) {
      stats.totalCommands++
      const parseStart = performance.now()
      
      try {
        const page = await EnhancedManPageParser.parseFromSystem(command)
        if (!page) {
          console.warn(`⚠️  Could not find man page for: ${command}`)
          stats.errorCount++
          continue
        }
        
        const cacheKey = `${page.name}.${page.section}`
        
        // Skip if already cached and unchanged
        if (manifest.pages[cacheKey]?.hash === page.hash) {
          stats.skippedCount++
          continue
        }
        
        // Save parsed page
        const fileName = `${page.name}.${page.section}.json`
        const filePath = path.join(DATA_DIR, fileName)
        const pageData = JSON.stringify(page, null, 2)
        
        await fs.writeFile(filePath, pageData)
        
        // Update manifest
        manifest.pages[cacheKey] = {
          hash: page.hash,
          parsedAt: page.parsedAt,
          size: pageData.length,
          complexity: page.complexity
        }
        
        // Update statistics
        stats.parsedCount++
        stats.complexityBreakdown[page.complexity]++
        stats.sectionBreakdown[page.section] = (stats.sectionBreakdown[page.section] || 0) + 1
        
        const parseTime = performance.now() - parseStart
        parseTimes.push(parseTime)
        
        allPages.push(page)
        
        console.log(`✅ ${command} (${page.complexity}) - ${parseTime.toFixed(0)}ms`)
      } catch (error) {
        console.error(`❌ Error parsing ${command}:`, error)
        stats.errorCount++
      }
    }
  }
  
  // Parse additional commands from all sections
  console.log('\n📚 Parsing additional system commands...')
  
  const additionalPages = await EnhancedManPageParser.parseAllAvailable({
    sections: [1, 8, 2, 3, 5], // Focus on most useful sections
    limit: 3000, // Parse up to 3000 total commands
    priorityCommands: Object.values(PRIORITY_COMMANDS).flat(),
    onProgress: (name, index, total) => {
      if (index % 50 === 0) {
        console.log(`Progress: ${index}/${total} commands processed`)
      }
    }
  })
  
  for (const page of additionalPages) {
    stats.totalCommands++
    const parseStart = performance.now()
    
    const cacheKey = `${page.name}.${page.section}`
    
    // Skip if already processed
    if (manifest.pages[cacheKey]) {
      stats.skippedCount++
      continue
    }
    
    const fileName = `${page.name}.${page.section}.json`
    const filePath = path.join(DATA_DIR, fileName)
    const pageData = JSON.stringify(page, null, 2)
    
    await fs.writeFile(filePath, pageData)
    
    manifest.pages[cacheKey] = {
      hash: page.hash,
      parsedAt: page.parsedAt,
      size: pageData.length,
      complexity: page.complexity
    }
    
    stats.parsedCount++
    stats.complexityBreakdown[page.complexity]++
    stats.sectionBreakdown[page.section] = (stats.sectionBreakdown[page.section] || 0) + 1
    
    const parseTime = performance.now() - parseStart
    parseTimes.push(parseTime)
    
    allPages.push(page)
  }
  
  // Calculate final statistics
  const endTime = performance.now()
  stats.totalTime = endTime - startTime
  stats.averageParseTime = parseTimes.length > 0 
    ? parseTimes.reduce((a, b) => a + b, 0) / parseTimes.length 
    : 0
  
  // Update manifest
  manifest.parsedAt = new Date().toISOString()
  manifest.totalPages = stats.parsedCount
  manifest.totalSize = Object.values(manifest.pages).reduce((sum, p) => sum + p.size, 0)
  
  await saveCacheManifest(manifest)
  
  // Build search indexes
  await createSearchIndex(allPages)
  
  // Generate TypeScript definitions
  await generateTypeScriptDefinitions(allPages)
  
  // Create main index file
  await generateMainIndex()
  
  // Print final statistics
  console.log('\n' + '='.repeat(60))
  console.log('✨ Man page parsing complete!')
  console.log('='.repeat(60))
  console.log(`📊 Total commands found: ${stats.totalCommands}`)
  console.log(`✅ Successfully parsed: ${stats.parsedCount}`)
  console.log(`⏭️  Skipped (cached): ${stats.skippedCount}`)
  console.log(`❌ Errors: ${stats.errorCount}`)
  console.log(`⏱️  Total time: ${(stats.totalTime / 1000).toFixed(2)}s`)
  console.log(`⚡ Average parse time: ${stats.averageParseTime.toFixed(0)}ms per page`)
  console.log('\n📈 Complexity breakdown:')
  console.log(`   Basic: ${stats.complexityBreakdown.basic}`)
  console.log(`   Intermediate: ${stats.complexityBreakdown.intermediate}`)
  console.log(`   Advanced: ${stats.complexityBreakdown.advanced}`)
  console.log('\n📑 Section breakdown:')
  Object.entries(stats.sectionBreakdown)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([section, count]) => {
      console.log(`   Section ${section}: ${count} pages`)
    })
  console.log(`\n💾 Total data size: ${(manifest.totalSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`📁 Output directory: ${DATA_DIR}`)
}

async function generateMainIndex() {
  const files = await fs.readdir(DATA_DIR)
  const manPages = files
    .filter(f => f.endsWith('.json') && !f.startsWith('.'))
    .map(f => f.replace('.json', ''))
    .sort()
  
  const indexContent = `// Auto-generated index file for man pages
// Generated at: ${new Date().toISOString()}
// Total pages: ${manPages.length}

import type { EnhancedManPage } from '../../lib/parser/enhanced-man-parser'

// Dynamic imports for code splitting
const manPageLoaders = {
${manPages.map(page => `  '${page}': () => import('./${page}.json')`).join(',\n')}
}

export async function loadManPage(name: string, section?: number): Promise<EnhancedManPage | null> {
  const key = section ? \`\${name}.\${section}\` : Object.keys(manPageLoaders).find(k => k.startsWith(name + '.'))
  
  if (!key || !manPageLoaders[key as keyof typeof manPageLoaders]) {
    return null
  }
  
  try {
    const module = await manPageLoaders[key as keyof typeof manPageLoaders]()
    return module.default
  } catch (error) {
    console.error(\`Failed to load man page \${key}:\`, error)
    return null
  }
}

export async function loadManPageSync(name: string, section?: number): Promise<EnhancedManPage | null> {
  return loadManPage(name, section)
}

export const availableManPages = ${JSON.stringify(manPages, null, 2)}

export function getAvailableCommands(): string[] {
  return availableManPages.map(p => p.split('.')[0])
}

export function getAvailableSections(): number[] {
  const sections = new Set(availableManPages.map(p => parseInt(p.split('.')[1])))
  return Array.from(sections).sort()
}
`
  
  await fs.writeFile(
    path.join(DATA_DIR, 'index.ts'),
    indexContent
  )
}

// Run the comprehensive parser
parseAndSaveAllManPages().catch(error => {
  console.error('Fatal error during parsing:', error)
  process.exit(1)
})