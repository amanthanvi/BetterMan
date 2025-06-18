#!/usr/bin/env tsx

import fs from 'fs/promises'
import path from 'path'
import { EnhancedManPage } from '../lib/parser/enhanced-man-parser'

const PARSED_DIR = path.join(process.cwd(), 'data', 'parsed-man-pages', 'json')
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'man-pages')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'enhanced-pages.ts')

interface SeeAlsoItem {
  name: string
  section: number
}

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
  seeAlso?: SeeAlsoItem[] // Fixed: Now preserves section information
  keywords?: string[]
  author?: string
  bugs?: string
}

async function convertEnhancedToBasic(enhanced: EnhancedManPage): Promise<BasicManPage> {
  // Filter out self-references and duplicates from seeAlso
  const seeAlsoMap = new Map<string, SeeAlsoItem>()
  
  for (const item of enhanced.seeAlso) {
    // Skip self-references
    if (item.name.toLowerCase() === enhanced.name.toLowerCase()) {
      continue
    }
    
    // Use name+section as key to avoid duplicates
    const key = `${item.name}-${item.section}`
    if (!seeAlsoMap.has(key)) {
      seeAlsoMap.set(key, item)
    }
  }
  
  // Clean up sections content
  const cleanedSections = enhanced.sections.map(section => {
    // Remove empty or malformed content
    const cleanContent = section.content
      .split('\n')
      .filter(line => line.trim().length > 0)
      .join('\n')
      .trim()
    
    return {
      id: section.id,
      title: section.title,
      content: cleanContent || section.content,
      level: section.level,
      subsections: section.subsections || []
    }
  }).filter(section => 
    // Filter out sections with no meaningful content
    section.content.length > 10 && 
    !section.content.match(/^(macOS|Linux|Unix)\s+\d+\.\d+\s+.*\d{4}\s+/i)
  )
  
  // Improve description extraction
  let description = enhanced.description
  if (!description || description.length < 20) {
    // Try to extract from first paragraph of DESCRIPTION section
    const descSection = enhanced.sections.find(s => 
      s.title.toUpperCase() === 'DESCRIPTION'
    )
    if (descSection && descSection.content) {
      const firstPara = descSection.content
        .split('\n\n')[0]
        .replace(/\s+/g, ' ')
        .trim()
      if (firstPara.length > 20) {
        description = firstPara
      }
    }
  }
  
  // Clean up examples
  const cleanedExamples = enhanced.examples
    .filter(e => e.command && e.command.length > 0)
    .map(e => {
      // Format: "command | description"
      if (e.description) {
        return `${e.command} | ${e.description}`
      }
      return e.command
    })
  
  return {
    name: enhanced.name,
    section: enhanced.section,
    title: enhanced.title,
    description: description,
    synopsis: enhanced.synopsis,
    category: enhanced.category,
    isCommon: enhanced.isCommon,
    searchContent: enhanced.searchContent,
    sections: cleanedSections,
    options: enhanced.flags.map(f => ({
      flag: f.shortFlag ? `${f.shortFlag}, ${f.flag}` : f.flag,
      description: f.description || ''
    })),
    examples: cleanedExamples,
    relatedCommands: enhanced.relatedCommands.filter(cmd => 
      cmd.toLowerCase() !== enhanced.name.toLowerCase()
    ),
    seeAlso: Array.from(seeAlsoMap.values()),
    keywords: enhanced.keywords,
    author: enhanced.metadata.author,
  }
}

async function migrate() {
  console.log('🚀 Starting migration of parsed man pages...')
  
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  
  // Read all JSON files
  const files = await fs.readdir(PARSED_DIR)
  const jsonFiles = files.filter(f => f.endsWith('.json'))
  
  console.log(`📋 Found ${jsonFiles.length} man pages to migrate`)
  
  const basicPages: BasicManPage[] = []
  const errors: string[] = []
  
  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(path.join(PARSED_DIR, file), 'utf-8')
      const enhanced: EnhancedManPage = JSON.parse(content)
      const basic = await convertEnhancedToBasic(enhanced)
      
      // Validate the converted page
      if (basic.name && basic.section && basic.description) {
        basicPages.push(basic)
        console.log(`✅ Migrated ${enhanced.name}(${enhanced.section})`)
      } else {
        errors.push(`${file}: Missing required fields`)
      }
    } catch (error) {
      console.error(`❌ Failed to migrate ${file}:`, error)
      errors.push(`${file}: ${error}`)
    }
  }
  
  // Sort pages by name and section
  basicPages.sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name)
    if (nameCompare !== 0) return nameCompare
    return a.section - b.section
  })
  
  // Generate TypeScript file with updated types
  const output = `// Auto-generated from parsed man pages
// Generated at: ${new Date().toISOString()}
// Total pages: ${basicPages.length}

export interface SeeAlsoItem {
  name: string
  section: number
}

export interface ManPage {
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
  seeAlso?: SeeAlsoItem[]
  keywords?: string[]
  author?: string
  bugs?: string
}

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

export function getRelatedPages(page: ManPage): ManPage[] {
  const related: ManPage[] = []
  const seen = new Set<string>()
  
  // Add pages from seeAlso
  if (page.seeAlso) {
    for (const ref of page.seeAlso) {
      const relatedPage = getManPage(ref.name, ref.section)
      if (relatedPage && !seen.has(\`\${ref.name}-\${ref.section}\`)) {
        related.push(relatedPage)
        seen.add(\`\${ref.name}-\${ref.section}\`)
      }
    }
  }
  
  // Add pages from relatedCommands
  if (page.relatedCommands) {
    for (const cmd of page.relatedCommands) {
      const relatedPage = getManPage(cmd)
      if (relatedPage && !seen.has(\`\${relatedPage.name}-\${relatedPage.section}\`)) {
        related.push(relatedPage)
        seen.add(\`\${relatedPage.name}-\${relatedPage.section}\`)
      }
    }
  }
  
  return related
}
`
  
  await fs.writeFile(OUTPUT_FILE, output)
  
  // Write migration report
  const reportPath = path.join(OUTPUT_DIR, 'migration-report.json')
  await fs.writeFile(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalPages: basicPages.length,
    errors: errors,
    stats: {
      bySection: basicPages.reduce((acc, page) => {
        acc[page.section] = (acc[page.section] || 0) + 1
        return acc
      }, {} as Record<number, number>),
      byCategory: basicPages.reduce((acc, page) => {
        const cat = page.category || 'Other'
        acc[cat] = (acc[cat] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      withExamples: basicPages.filter(p => p.examples && p.examples.length > 0).length,
      commonCommands: basicPages.filter(p => p.isCommon).length
    }
  }, null, 2))
  
  console.log('\n✨ Migration complete!')
  console.log(`📁 Output: ${OUTPUT_FILE}`)
  console.log(`📊 Total pages migrated: ${basicPages.length}`)
  if (errors.length > 0) {
    console.log(`⚠️  Errors encountered: ${errors.length}`)
  }
}

migrate().catch(console.error)