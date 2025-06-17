#!/usr/bin/env tsx

import fs from 'fs/promises'
import path from 'path'
import { EnhancedManPage } from '../lib/parser/enhanced-man-parser'

const LINUX_DIR = path.join(process.cwd(), 'data', 'parsed-man-pages-linux', 'json')
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'man-pages')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'enhanced-pages.ts')

interface BasicManPage {
  name: string
  section: number
  title: string
  description: string
  synopsis?: string
  category?: string
  isCommon?: boolean
  searchContent?: string
  sections?: Array<{
    id: string
    title: string
    content: string
    level: number
    subsections?: any[]
  }>
  options?: Array<{
    flag: string
    description: string
  }>
  examples?: string[]
  relatedCommands?: string[]
  seeAlso?: string[]
  keywords?: string[]
  author?: string
  bugs?: string
}

async function convertEnhancedToBasic(enhanced: EnhancedManPage): Promise<BasicManPage> {
  return {
    name: enhanced.name,
    section: enhanced.section,
    title: enhanced.title,
    description: enhanced.description,
    synopsis: enhanced.synopsis,
    category: enhanced.category,
    isCommon: enhanced.isCommon,
    searchContent: enhanced.searchContent,
    sections: enhanced.sections.map(s => ({
      id: s.id,
      title: s.title,
      content: s.content,
      level: s.level,
      subsections: s.subsections
    })),
    options: enhanced.flags.map(f => ({
      flag: f.shortFlag ? `${f.shortFlag}, ${f.flag}` : f.flag,
      description: f.description
    })),
    examples: enhanced.examples.map(e => e.command),
    relatedCommands: enhanced.relatedCommands,
    seeAlso: enhanced.seeAlso.map(s => s.name),
    keywords: enhanced.keywords,
    author: enhanced.metadata.author,
  }
}

async function migrate() {
  console.log('🚀 Starting migration of Linux man pages...')
  
  try {
    // Check if Linux man pages exist
    await fs.access(LINUX_DIR)
  } catch (error) {
    console.error('❌ Linux man pages directory not found. Run parse-man-pages-ci.ts first.')
    process.exit(1)
  }
  
  // Read all JSON files
  const files = await fs.readdir(LINUX_DIR)
  const jsonFiles = files.filter(f => f.endsWith('.json'))
  
  console.log(`📋 Found ${jsonFiles.length} Linux man pages to migrate`)
  
  const basicPages: BasicManPage[] = []
  const stats = {
    migrated: 0,
    failed: 0,
    bySection: {} as Record<number, number>,
    byCategory: {} as Record<string, number>
  }
  
  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(path.join(LINUX_DIR, file), 'utf-8')
      const enhanced: EnhancedManPage = JSON.parse(content)
      const basic = await convertEnhancedToBasic(enhanced)
      basicPages.push(basic)
      
      // Update stats
      stats.migrated++
      stats.bySection[enhanced.section] = (stats.bySection[enhanced.section] || 0) + 1
      stats.byCategory[enhanced.category] = (stats.byCategory[enhanced.category] || 0) + 1
      
      if (stats.migrated % 100 === 0) {
        console.log(`   Migrated ${stats.migrated} pages...`)
      }
    } catch (error) {
      console.error(`❌ Failed to migrate ${file}:`, error)
      stats.failed++
    }
  }
  
  // Sort pages for consistent output
  basicPages.sort((a, b) => {
    if (a.name === b.name) {
      return a.section - b.section
    }
    return a.name.localeCompare(b.name)
  })
  
  // Generate TypeScript file
  const output = `// Auto-generated from Linux man pages
// Generated at: ${new Date().toISOString()}
// Total pages: ${basicPages.length}
// Source: Ubuntu Linux (via CI/CD pipeline)

import { ManPage } from './types'

export const enhancedManPages: ManPage[] = ${JSON.stringify(basicPages, null, 2)}

export const manPageList = enhancedManPages

export function getManPage(name: string, section?: number): ManPage | undefined {
  return enhancedManPages.find(page => 
    page.name === name && 
    (section === undefined || page.section === section)
  )
}

export function searchManPages(query: string): ManPage[] {
  const lowerQuery = query.toLowerCase()
  return enhancedManPages.filter(page => 
    page.name.toLowerCase().includes(lowerQuery) ||
    page.title.toLowerCase().includes(lowerQuery) ||
    page.description.toLowerCase().includes(lowerQuery) ||
    (page.keywords || []).some(k => k.toLowerCase().includes(lowerQuery))
  )
}

export function getManPagesByCategory(): Record<string, ManPage[]> {
  const categories: Record<string, ManPage[]> = {}
  
  for (const page of enhancedManPages) {
    const category = page.category || 'Other'
    if (!categories[category]) {
      categories[category] = []
    }
    categories[category].push(page)
  }
  
  return categories
}

export function getCommonCommands(): ManPage[] {
  return enhancedManPages.filter(p => p.isCommon).slice(0, 50)
}

export const stats = {
  total: ${basicPages.length},
  bySection: ${JSON.stringify(stats.bySection, null, 2)},
  byCategory: ${JSON.stringify(stats.byCategory, null, 2)},
  source: 'Ubuntu Linux',
  generatedAt: '${new Date().toISOString()}'
}
`
  
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_FILE, output)
  
  // Create/update a stats file
  const statsFile = path.join(OUTPUT_DIR, 'stats.json')
  const statsContent = {
    lastUpdate: new Date().toISOString(),
    source: 'Ubuntu Linux (CI/CD)',
    totalPages: basicPages.length,
    sections: stats.bySection,
    categories: stats.byCategory,
    migrationStats: {
      successful: stats.migrated,
      failed: stats.failed
    }
  }
  
  await fs.writeFile(statsFile, JSON.stringify(statsContent, null, 2))
  
  console.log('\n✨ Migration complete!')
  console.log(`📁 Output: ${OUTPUT_FILE}`)
  console.log(`📊 Total pages migrated: ${stats.migrated}`)
  console.log(`❌ Failed: ${stats.failed}`)
  
  console.log('\n📑 Section breakdown:')
  Object.entries(stats.bySection)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([section, count]) => {
      console.log(`   Section ${section}: ${count} pages`)
    })
  
  console.log('\n📁 Top categories:')
  Object.entries(stats.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([category, count]) => {
      console.log(`   ${category}: ${count} pages`)
    })
}

migrate().catch(console.error)