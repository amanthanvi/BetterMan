#!/usr/bin/env tsx

import fs from 'fs/promises'
import path from 'path'

const ENHANCED_PAGES_PATH = path.join(process.cwd(), 'data', 'man-pages', 'enhanced-pages.ts')

async function fixSeeAlso() {
  console.log('🔧 Fixing seeAlso references in enhanced-pages.ts...')
  
  // Read the current file
  const content = await fs.readFile(ENHANCED_PAGES_PATH, 'utf-8')
  
  // Extract the JSON data
  const match = content.match(/export const enhancedManPages: ManPage\[\] = (\[[\s\S]+?\])\n\nexport const manPageList/)
  
  if (!match || !match[1]) {
    throw new Error('Could not extract man pages data')
  }
  
  // Parse the JSON
  const pages = JSON.parse(match[1])
  
  console.log(`📋 Processing ${pages.length} man pages...`)
  
  let fixedCount = 0
  
  // Fix each page
  const fixedPages = pages.map((page: any) => {
    const fixed = { ...page }
    
    // Fix seeAlso if it's an array of strings
    if (Array.isArray(page.seeAlso) && page.seeAlso.length > 0 && typeof page.seeAlso[0] === 'string') {
      fixed.seeAlso = page.seeAlso
        .filter((ref: string) => ref.toLowerCase() !== page.name.toLowerCase()) // Remove self-references
        .map((ref: string) => {
          // Try to extract section if it's in the format "command(section)"
          const match = ref.match(/^([^(]+)\((\d+)\)$/)
          if (match) {
            return { name: match[1], section: parseInt(match[2]) }
          }
          // Default to section 1 for commands
          return { name: ref, section: 1 }
        })
        .filter((ref: any, index: number, self: any[]) => 
          // Remove duplicates
          index === self.findIndex(r => r.name === ref.name && r.section === ref.section)
        )
      
      fixedCount++
    }
    
    // Ensure relatedCommands doesn't include self
    if (Array.isArray(fixed.relatedCommands)) {
      fixed.relatedCommands = fixed.relatedCommands.filter(
        (cmd: string) => cmd.toLowerCase() !== page.name.toLowerCase()
      )
    }
    
    return fixed
  })
  
  // Generate the new file content
  const newContent = `// Auto-generated from parsed man pages
// Generated at: ${new Date().toISOString()}
// Total pages: ${fixedPages.length}
// Fixed seeAlso references: ${fixedCount}

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

export const enhancedManPages: ManPage[] = ${JSON.stringify(fixedPages, null, 2)}

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
  
  // Write the fixed file
  await fs.writeFile(ENHANCED_PAGES_PATH, newContent)
  
  console.log(`✅ Fixed ${fixedCount} pages with string-based seeAlso references`)
  console.log(`📁 Updated: ${ENHANCED_PAGES_PATH}`)
}

fixSeeAlso().catch(console.error)