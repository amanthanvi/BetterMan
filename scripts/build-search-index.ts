#!/usr/bin/env tsx

import fs from 'fs/promises'
import path from 'path'
import Fuse from 'fuse.js'

const DATA_DIR = path.join(process.cwd(), 'data', 'man-pages')
const INDEX_DIR = path.join(process.cwd(), 'data', 'search-index')

interface SearchDocument {
  id: string
  name: string
  section: number
  title: string
  description: string
  category: string
  keywords: string[]
  content: string
  isCommon: boolean
  examples: string[]
}

async function buildSearchIndex() {
  console.log('🔍 Building search index...')
  
  // Ensure directories exist
  await fs.mkdir(INDEX_DIR, { recursive: true })
  
  // Load all man pages
  const files = await fs.readdir(DATA_DIR)
  const manPageFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('.'))
  
  const documents: SearchDocument[] = []
  
  for (const file of manPageFiles) {
    try {
      const content = await fs.readFile(path.join(DATA_DIR, file), 'utf-8')
      const page = JSON.parse(content)
      
      // Extract keywords from content
      const keywords = extractKeywords(page)
      
      documents.push({
        id: `${page.name}.${page.section}`,
        name: page.name,
        section: page.section,
        title: page.title,
        description: page.description,
        category: page.category || 'Other',
        keywords,
        content: page.searchContent,
        isCommon: page.isCommon || false,
        examples: page.examples || []
      })
    } catch (error) {
      console.error(`Error processing ${file}:`, error)
    }
  }
  
  console.log(`📄 Loaded ${documents.length} documents`)
  
  // Create different indexes for different search strategies
  
  // 1. Quick lookup index (name-based)
  const nameIndex = documents.reduce((acc, doc) => {
    acc[doc.name] = doc
    return acc
  }, {} as Record<string, SearchDocument>)
  
  await fs.writeFile(
    path.join(INDEX_DIR, 'name-index.json'),
    JSON.stringify(nameIndex, null, 2)
  )
  
  // 2. Category index
  const categoryIndex = documents.reduce((acc, doc) => {
    if (!acc[doc.category]) acc[doc.category] = []
    acc[doc.category].push({
      id: doc.id,
      name: doc.name,
      title: doc.title,
      description: doc.description
    })
    return acc
  }, {} as Record<string, any[]>)
  
  await fs.writeFile(
    path.join(INDEX_DIR, 'category-index.json'),
    JSON.stringify(categoryIndex, null, 2)
  )
  
  // 3. Fuse.js index for fuzzy search
  const fuseIndex = Fuse.createIndex(
    ['name', 'title', 'description', 'keywords', 'content'],
    documents
  )
  
  await fs.writeFile(
    path.join(INDEX_DIR, 'fuse-index.json'),
    JSON.stringify(fuseIndex.toJSON())
  )
  
  // 4. Document list for Fuse
  await fs.writeFile(
    path.join(INDEX_DIR, 'documents.json'),
    JSON.stringify(documents, null, 2)
  )
  
  // 5. Common commands index
  const commonCommands = documents
    .filter(d => d.isCommon)
    .map(d => ({
      id: d.id,
      name: d.name,
      title: d.title,
      description: d.description
    }))
  
  await fs.writeFile(
    path.join(INDEX_DIR, 'common-commands.json'),
    JSON.stringify(commonCommands, null, 2)
  )
  
  // Generate TypeScript index file
  const indexContent = generateIndexFile()
  await fs.writeFile(
    path.join(INDEX_DIR, 'index.ts'),
    indexContent
  )
  
  console.log('✅ Search index built successfully!')
  console.log(`   📁 Output: ${INDEX_DIR}`)
  console.log(`   📊 Total documents: ${documents.length}`)
  console.log(`   🏷️  Categories: ${Object.keys(categoryIndex).length}`)
  console.log(`   ⭐ Common commands: ${commonCommands.length}`)
}

function extractKeywords(page: any): string[] {
  const keywords = new Set<string>()
  
  // Add name variations
  keywords.add(page.name)
  if (page.name.includes('-')) {
    keywords.add(page.name.replace(/-/g, ''))
    page.name.split('-').forEach((part: string) => keywords.add(part))
  }
  
  // Extract from title and description
  const words = (page.title + ' ' + page.description)
    .toLowerCase()
    .split(/\\s+/)
    .filter((word: string) => word.length > 3)
  
  words.forEach((word: string) => keywords.add(word))
  
  // Add related commands
  if (page.relatedCommands) {
    page.relatedCommands.forEach((cmd: string) => keywords.add(cmd))
  }
  
  return Array.from(keywords).slice(0, 20)
}

function generateIndexFile(): string {
  return `// Auto-generated search index
import nameIndex from './name-index.json'
import categoryIndex from './category-index.json'
import fuseIndexData from './fuse-index.json'
import documents from './documents.json'
import commonCommands from './common-commands.json'
import Fuse from 'fuse.js'

// Reconstruct Fuse index
const fuseIndex = Fuse.parseIndex(fuseIndexData)

// Create Fuse instance
export const fuse = new Fuse(documents, {
  keys: ['name', 'title', 'description', 'keywords', 'content'],
  threshold: 0.3,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  shouldSort: true,
  findAllMatches: true,
  ignoreLocation: true,
  useExtendedSearch: true
}, fuseIndex)

export { nameIndex, categoryIndex, documents, commonCommands }

// Quick lookup by name
export function getByName(name: string) {
  return nameIndex[name as keyof typeof nameIndex] || null
}

// Get by category
export function getByCategory(category: string) {
  return categoryIndex[category as keyof typeof categoryIndex] || []
}

// Search function
export function search(query: string, options?: { limit?: number; section?: number }) {
  const { limit = 50, section } = options || {}
  
  let results = fuse.search(query)
  
  if (section) {
    results = results.filter(r => r.item.section === section)
  }
  
  return results.slice(0, limit).map(r => ({
    ...r.item,
    score: r.score
  }))
}

// Autocomplete suggestions
export function getSuggestions(prefix: string, limit = 10) {
  const p = prefix.toLowerCase()
  return documents
    .filter(d => d.name.toLowerCase().startsWith(p))
    .sort((a, b) => {
      // Prioritize exact matches and common commands
      if (a.name === prefix && b.name !== prefix) return -1
      if (b.name === prefix && a.name !== prefix) return 1
      if (a.isCommon && !b.isCommon) return -1
      if (!a.isCommon && b.isCommon) return 1
      return a.name.localeCompare(b.name)
    })
    .slice(0, limit)
}
`
}

// Run the builder
buildSearchIndex().catch(console.error)