#!/usr/bin/env tsx

import fs from 'fs/promises'
import path from 'path'
import { EnhancedManPage } from '../lib/parser/enhanced-man-parser'

const PARSED_DIR = path.join(process.cwd(), 'data', 'parsed-man-pages', 'json')
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
  console.log('🚀 Starting migration of parsed man pages...')
  
  // Read all JSON files
  const files = await fs.readdir(PARSED_DIR)
  const jsonFiles = files.filter(f => f.endsWith('.json'))
  
  console.log(`📋 Found ${jsonFiles.length} man pages to migrate`)
  
  const basicPages: BasicManPage[] = []
  
  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(path.join(PARSED_DIR, file), 'utf-8')
      const enhanced: EnhancedManPage = JSON.parse(content)
      const basic = await convertEnhancedToBasic(enhanced)
      basicPages.push(basic)
      console.log(`✅ Migrated ${enhanced.name} (${enhanced.section})`)
    } catch (error) {
      console.error(`❌ Failed to migrate ${file}:`, error)
    }
  }
  
  // Generate TypeScript file
  const output = `// Auto-generated from parsed man pages
// Generated at: ${new Date().toISOString()}
// Total pages: ${basicPages.length}

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
  return enhancedManPages.filter(p => p.isCommon).slice(0, 20)
}
`
  
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_FILE, output)
  
  // Also create a types file
  const typesFile = path.join(OUTPUT_DIR, 'types.ts')
  const typesContent = `export interface ManPage {
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
`
  
  await fs.writeFile(typesFile, typesContent)
  
  console.log('\n✨ Migration complete!')
  console.log(`📁 Output: ${OUTPUT_FILE}`)
  console.log(`📊 Total pages migrated: ${basicPages.length}`)
}

migrate().catch(console.error)