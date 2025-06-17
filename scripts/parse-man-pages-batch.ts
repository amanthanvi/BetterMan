#!/usr/bin/env tsx

import { EnhancedManPageParser, type EnhancedManPage } from '../lib/parser/enhanced-man-parser'
import fs from 'fs/promises'
import path from 'path'
import { performance } from 'perf_hooks'

const DATA_DIR = path.join(process.cwd(), 'data', 'parsed-man-pages')

// List of commands to parse - carefully curated to avoid parsing issues
const COMMANDS_TO_PARSE = [
  // Core utilities
  'ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'touch',
  'chmod', 'chown', 'man', 'which', 'clear', 'exit', 'history', 'date',
  'cal', 'whoami', 'hostname', 'uname', 'uptime', 'df', 'du', 'free',
  
  // File operations
  'find', 'grep', 'sed', 'awk', 'cut', 'sort', 'uniq', 'head', 'tail',
  'less', 'more', 'wc', 'diff', 'patch', 'tree', 'ln', 'readlink',
  'basename', 'dirname', 'stat', 'file', 'strings', 'od', 'hexdump',
  
  // Text processing
  'tr', 'tee', 'paste', 'join', 'comm', 'column', 'expand', 'unexpand',
  'fmt', 'fold', 'pr', 'nl', 'split', 'csplit', 'tac', 'rev',
  
  // Process management
  'ps', 'top', 'kill', 'killall', 'jobs', 'fg', 'bg', 'nohup',
  'nice', 'renice', 'pgrep', 'pkill', 'pidof', 'sleep', 'wait',
  
  // Network tools
  'curl', 'wget', 'ssh', 'scp', 'rsync', 'ping', 'traceroute', 'dig',
  'nslookup', 'host', 'ifconfig', 'netstat', 'ss', 'nc', 'telnet',
  
  // Archive & compression
  'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'bzip2', 'bunzip2', 'xz',
  'zcat', 'zless', 'zmore', 'compress', 'uncompress',
  
  // Development tools
  'git', 'make', 'gcc', 'vim', 'nano', 'emacs', 'tmux', 'screen',
  'docker', 'npm', 'node', 'python', 'python3', 'pip', 'pip3',
  
  // System tools
  'sudo', 'su', 'passwd', 'useradd', 'usermod', 'groupadd', 'id',
  'mount', 'umount', 'fsck', 'fdisk', 'mkfs', 'lsblk', 'blkid',
  
  // Shell builtins and utilities
  'alias', 'unalias', 'export', 'source', 'env', 'printenv', 'set',
  'unset', 'type', 'command', 'builtin', 'hash', 'help',
  
  // Math and misc
  'bc', 'dc', 'expr', 'factor', 'seq', 'shuf', 'yes', 'true', 'false',
  'test', 'printf', 'xargs', 'parallel', 'time', 'timeout', 'watch'
]

interface ParseStats {
  total: number
  successful: number
  failed: number
  skipped: number
  duration: number
}

async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.mkdir(path.join(DATA_DIR, 'json'), { recursive: true })
}

async function parseCommand(command: string): Promise<EnhancedManPage | null> {
  try {
    console.log(`📖 Parsing: ${command}...`)
    const startTime = performance.now()
    
    const page = await EnhancedManPageParser.parseFromSystem(command)
    
    if (page) {
      const duration = performance.now() - startTime
      console.log(`✅ Success: ${command} (${page.complexity}) - ${duration.toFixed(0)}ms`)
      return page
    } else {
      console.warn(`⚠️  Not found: ${command}`)
      return null
    }
  } catch (error) {
    console.error(`❌ Error parsing ${command}:`, error instanceof Error ? error.message : error)
    return null
  }
}

async function savePage(page: EnhancedManPage) {
  const fileName = `${page.name}.${page.section}.json`
  const filePath = path.join(DATA_DIR, 'json', fileName)
  
  await fs.writeFile(filePath, JSON.stringify(page, null, 2))
}

async function generateIndex(pages: EnhancedManPage[]) {
  console.log('\n📚 Generating index files...')
  
  // Generate TypeScript index
  const indexContent = `// Auto-generated index of parsed man pages
// Generated at: ${new Date().toISOString()}
// Total pages: ${pages.length}

import type { EnhancedManPage } from '../../lib/parser/enhanced-man-parser'

export const manPages: Record<string, () => Promise<{ default: EnhancedManPage }>> = {
${pages.map(p => `  '${p.name}.${p.section}': () => import('./json/${p.name}.${p.section}.json')`).join(',\n')}
}

export const availableCommands = [
${pages.map(p => `  '${p.name}'`).join(',\n')}
]

export const commandsBySection: Record<number, string[]> = {
${Object.entries(
  pages.reduce((acc, p) => {
    if (!acc[p.section]) acc[p.section] = []
    acc[p.section].push(p.name)
    return acc
  }, {} as Record<number, string[]>)
).map(([section, commands]) => `  ${section}: [${commands.map(c => `'${c}'`).join(', ')}]`).join(',\n')}
}

export const commandsByCategory: Record<string, string[]> = {
${Object.entries(
  pages.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p.name)
    return acc
  }, {} as Record<string, string[]>)
).map(([category, commands]) => `  '${category}': [${commands.map(c => `'${c}'`).join(', ')}]`).join(',\n')}
}

export const commandsByComplexity: Record<string, string[]> = {
${Object.entries(
  pages.reduce((acc, p) => {
    if (!acc[p.complexity]) acc[p.complexity] = []
    acc[p.complexity].push(p.name)
    return acc
  }, {} as Record<string, string[]>)
).map(([complexity, commands]) => `  '${complexity}': [${commands.map(c => `'${c}'`).join(', ')}]`).join(',\n')}
}

export async function loadManPage(name: string, section?: number): Promise<EnhancedManPage | null> {
  const key = section ? \`\${name}.\${section}\` : Object.keys(manPages).find(k => k.startsWith(name + '.'))
  
  if (!key || !manPages[key]) {
    return null
  }
  
  try {
    const module = await manPages[key]()
    return module.default
  } catch (error) {
    console.error(\`Failed to load man page \${key}:\`, error)
    return null
  }
}
`

  await fs.writeFile(path.join(DATA_DIR, 'index.ts'), indexContent)
  
  // Generate manifest
  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalPages: pages.length,
    pages: pages.map(p => ({
      name: p.name,
      section: p.section,
      title: p.title,
      category: p.category,
      complexity: p.complexity,
      flagCount: p.flags.length,
      exampleCount: p.examples.length,
      size: JSON.stringify(p).length
    }))
  }
  
  await fs.writeFile(
    path.join(DATA_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  )
  
  console.log('✅ Index files generated')
}

async function main() {
  console.log('🚀 Starting batch man page parsing...')
  console.log(`📋 Total commands to parse: ${COMMANDS_TO_PARSE.length}\n`)
  
  const startTime = performance.now()
  const stats: ParseStats = {
    total: COMMANDS_TO_PARSE.length,
    successful: 0,
    failed: 0,
    skipped: 0,
    duration: 0
  }
  
  await ensureDirectories()
  
  const pages: EnhancedManPage[] = []
  
  // Parse in batches to avoid overwhelming the system
  const BATCH_SIZE = 10
  for (let i = 0; i < COMMANDS_TO_PARSE.length; i += BATCH_SIZE) {
    const batch = COMMANDS_TO_PARSE.slice(i, i + BATCH_SIZE)
    console.log(`\n🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(COMMANDS_TO_PARSE.length / BATCH_SIZE)}`)
    
    const batchPromises = batch.map(async (command) => {
      const page = await parseCommand(command)
      if (page) {
        await savePage(page)
        return page
      }
      return null
    })
    
    const batchResults = await Promise.all(batchPromises)
    
    for (const page of batchResults) {
      if (page) {
        pages.push(page)
        stats.successful++
      } else {
        stats.failed++
      }
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < COMMANDS_TO_PARSE.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  stats.duration = performance.now() - startTime
  
  // Generate index files
  await generateIndex(pages)
  
  // Print statistics
  console.log('\n' + '='.repeat(60))
  console.log('✨ Batch parsing complete!')
  console.log('='.repeat(60))
  console.log(`📊 Total commands: ${stats.total}`)
  console.log(`✅ Successfully parsed: ${stats.successful}`)
  console.log(`❌ Failed: ${stats.failed}`)
  console.log(`⏱️  Total time: ${(stats.duration / 1000).toFixed(2)}s`)
  console.log(`⚡ Average time per command: ${(stats.duration / stats.total).toFixed(0)}ms`)
  console.log(`\n📁 Output directory: ${DATA_DIR}`)
}

// Run the parser
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})