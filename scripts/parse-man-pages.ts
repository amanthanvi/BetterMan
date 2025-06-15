#!/usr/bin/env tsx

import { ManPageParser } from '../lib/parser/man-parser'
import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'

const DATA_DIR = path.join(process.cwd(), 'data', 'man-pages')
const CACHE_FILE = path.join(DATA_DIR, '.cache-manifest.json')

interface CacheManifest {
  version: string
  parsedAt: string
  pages: {
    [key: string]: {
      hash: string
      parsedAt: string
    }
  }
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

function generateHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

async function parseAndSaveManPages() {
  console.log('🚀 Starting man page parsing...')
  
  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true })
  
  // Load cache manifest
  const manifest = await loadCacheManifest() || {
    version: '1.0',
    parsedAt: new Date().toISOString(),
    pages: {}
  }
  
  // Priority commands to parse first
  const priorityCommands = [
    'ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'grep',
    'find', 'sed', 'awk', 'cut', 'sort', 'head', 'tail', 'man', 'chmod',
    'ps', 'kill', 'tar', 'curl', 'wget', 'ssh', 'git', 'vim', 'docker'
  ]
  
  let parsedCount = 0
  let skippedCount = 0
  let errorCount = 0
  
  // Parse priority commands first
  console.log('📋 Parsing priority commands...')
  for (const command of priorityCommands) {
    try {
      const page = await ManPageParser.parseFromSystem(command)
      if (!page) {
        console.warn(`⚠️  Could not find man page for: ${command}`)
        errorCount++
        continue
      }
      
      const hash = generateHash(page.rawContent)
      const cacheKey = `${page.name}.${page.section}`
      
      // Skip if already cached and unchanged
      if (manifest.pages[cacheKey]?.hash === hash) {
        skippedCount++
        continue
      }
      
      // Save parsed page
      const fileName = `${page.name}.${page.section}.json`
      const filePath = path.join(DATA_DIR, fileName)
      
      await fs.writeFile(filePath, JSON.stringify({
        ...page,
        rawContent: undefined // Don't store raw content to save space
      }, null, 2))
      
      // Update manifest
      manifest.pages[cacheKey] = {
        hash,
        parsedAt: new Date().toISOString()
      }
      
      parsedCount++
      console.log(`✅ Parsed: ${command} (${parsedCount} done)`)
    } catch (error) {
      console.error(`❌ Error parsing ${command}:`, error)
      errorCount++
    }
  }
  
  // Parse additional common commands (with limit for build time)
  console.log('\\n📚 Parsing additional commands...')
  const additionalPages = await ManPageParser.parseAllAvailable({
    sections: [1, 8], // User commands and system admin
    limit: 100,
    onProgress: (name, index, total) => {
      if (index % 10 === 0) {
        console.log(`Progress: ${index}/${total} commands processed`)
      }
    }
  })
  
  for (const page of additionalPages) {
    const hash = generateHash(page.rawContent)
    const cacheKey = `${page.name}.${page.section}`
    
    // Skip if already parsed or cached
    if (manifest.pages[cacheKey]?.hash === hash) {
      skippedCount++
      continue
    }
    
    const fileName = `${page.name}.${page.section}.json`
    const filePath = path.join(DATA_DIR, fileName)
    
    await fs.writeFile(filePath, JSON.stringify({
      ...page,
      rawContent: undefined
    }, null, 2))
    
    manifest.pages[cacheKey] = {
      hash,
      parsedAt: new Date().toISOString()
    }
    
    parsedCount++
  }
  
  // Save updated manifest
  manifest.parsedAt = new Date().toISOString()
  await saveCacheManifest(manifest)
  
  // Create index file for easy importing
  const indexContent = await generateIndex()
  await fs.writeFile(
    path.join(DATA_DIR, 'index.ts'),
    indexContent
  )
  
  console.log(`\\n✨ Man page parsing complete!`)
  console.log(`   📊 Parsed: ${parsedCount}`)
  console.log(`   ⏭️  Skipped (cached): ${skippedCount}`)
  console.log(`   ❌ Errors: ${errorCount}`)
  console.log(`   📁 Output: ${DATA_DIR}`)
}

async function generateIndex(): Promise<string> {
  const files = await fs.readdir(DATA_DIR)
  const manPages = files
    .filter(f => f.endsWith('.json') && !f.startsWith('.'))
    .map(f => f.replace('.json', ''))
  
  const imports = manPages.map((page, i) => 
    `import page${i} from './${page}.json'`
  ).join('\\n')
  
  const exports = `
export const manPages = {
${manPages.map((page, i) => `  '${page}': page${i}`).join(',\\n')}
}

export const manPageList = [
${manPages.map((page, i) => `  page${i}`).join(',\\n')}
]

export function getManPage(name: string, section?: number) {
  const key = section ? \`\${name}.\${section}\` : Object.keys(manPages).find(k => k.startsWith(name + '.'))
  return key ? manPages[key as keyof typeof manPages] : null
}
`
  
  return `// Auto-generated index file
${imports}

${exports}`
}

// Run the parser
parseAndSaveManPages().catch(console.error)