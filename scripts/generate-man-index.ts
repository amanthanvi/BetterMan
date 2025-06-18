#!/usr/bin/env tsx

import fs from 'fs/promises'
import path from 'path'

const MAN_PAGES_DIR = path.join(process.cwd(), 'data', 'man-pages')

async function generateIndex() {
  console.log('📚 Generating man page index...')
  
  // Read the enhanced pages
  const pagesPath = path.join(MAN_PAGES_DIR, 'enhanced-pages.ts')
  const content = await fs.readFile(pagesPath, 'utf-8')
  
  // Extract pages
  const match = content.match(/export const enhancedManPages: ManPage\[\] = (\[[\s\S]+?\])\n\nexport/)
  if (!match) {
    throw new Error('Could not extract man pages')
  }
  
  const pages = JSON.parse(match[1])
  
  // Generate index by category
  const byCategory: Record<string, any[]> = {}
  const bySection: Record<number, any[]> = {}
  const commonCommands: any[] = []
  
  for (const page of pages) {
    // By category
    const category = page.category || 'Other'
    if (!byCategory[category]) {
      byCategory[category] = []
    }
    byCategory[category].push({
      name: page.name,
      section: page.section,
      title: page.title,
      description: page.description.slice(0, 100) + (page.description.length > 100 ? '...' : '')
    })
    
    // By section
    if (!bySection[page.section]) {
      bySection[page.section] = []
    }
    bySection[page.section].push({
      name: page.name,
      title: page.title,
      category: page.category
    })
    
    // Common commands
    if (page.isCommon) {
      commonCommands.push({
        name: page.name,
        section: page.section,
        title: page.title,
        description: page.description
      })
    }
  }
  
  // Sort entries
  for (const category of Object.keys(byCategory)) {
    (byCategory as any)[category].sort((a: any, b: any) => a.name.localeCompare(b.name))
  }
  
  for (const section of Object.keys(bySection)) {
    (bySection as any)[section].sort((a: any, b: any) => a.name.localeCompare(b.name))
  }
  
  commonCommands.sort((a, b) => a.name.localeCompare(b.name))
  
  // Generate index file
  const indexContent = `// Auto-generated man page index
// Generated at: ${new Date().toISOString()}
// Total pages: ${pages.length}

export const manPageIndex = {
  totalPages: ${pages.length},
  
  byCategory: ${JSON.stringify(byCategory, null, 2)},
  
  bySection: ${JSON.stringify(bySection, null, 2)},
  
  commonCommands: ${JSON.stringify(commonCommands, null, 2)},
  
  sectionNames: {
    1: 'User Commands',
    2: 'System Calls',
    3: 'Library Functions',
    4: 'Special Files',
    5: 'File Formats',
    6: 'Games',
    7: 'Miscellaneous',
    8: 'System Administration'
  },
  
  categoryStats: ${JSON.stringify(
    Object.entries(byCategory).map(([cat, items]) => ({
      category: cat,
      count: items.length
    })).sort((a, b) => b.count - a.count),
    null,
    2
  )},
  
  sectionStats: ${JSON.stringify(
    Object.entries(bySection).map(([sec, items]) => ({
      section: parseInt(sec),
      count: items.length
    })).sort((a, b) => a.section - b.section),
    null,
    2
  )}
}

export function getPagesByCategory(category: string) {
  return manPageIndex.byCategory[category] || []
}

export function getPagesBySection(section: number) {
  return manPageIndex.bySection[section] || []
}

export function getCategoryStats() {
  return manPageIndex.categoryStats
}

export function getSectionStats() {
  return manPageIndex.sectionStats
}

export function getCommonCommandsList() {
  return manPageIndex.commonCommands
}
`
  
  const indexPath = path.join(MAN_PAGES_DIR, 'index.ts')
  await fs.writeFile(indexPath, indexContent)
  
  // Generate README with statistics
  const readmeContent = `# Man Pages Data

Generated at: ${new Date().toISOString()}

## Statistics

- **Total Pages**: ${pages.length}
- **Common Commands**: ${commonCommands.length}

### By Section

${Object.entries(bySection)
  .sort(([a], [b]) => parseInt(a) - parseInt(b))
  .map(([section, items]) => `- Section ${section}: ${items.length} pages`)
  .join('\n')}

### By Category

${Object.entries(byCategory)
  .sort(([, a], [, b]) => b.length - a.length)
  .slice(0, 10)
  .map(([category, items]) => `- ${category}: ${items.length} pages`)
  .join('\n')}

## Data Structure

The man pages are stored in \`enhanced-pages.ts\` with the following structure:

\`\`\`typescript
interface ManPage {
  name: string
  section: number
  title: string
  description: string
  synopsis?: string
  category?: string
  isCommon?: boolean
  seeAlso?: Array<{ name: string; section: number }>
  // ... more fields
}
\`\`\`

## Usage

\`\`\`typescript
import { getManPage, searchManPages } from './enhanced-pages'

// Get a specific man page
const lsPage = getManPage('ls', 1)

// Search for man pages
const results = searchManPages('file')
\`\`\`
`
  
  const readmePath = path.join(MAN_PAGES_DIR, 'README.md')
  await fs.writeFile(readmePath, readmeContent)
  
  console.log(`✅ Generated index with ${pages.length} pages`)
  console.log(`📁 Index: ${indexPath}`)
  console.log(`📁 README: ${readmePath}`)
  
  // Print summary
  console.log('\n📊 Summary:')
  console.log(`- Categories: ${Object.keys(byCategory).length}`)
  console.log(`- Common commands: ${commonCommands.length}`)
  console.log(`- Section coverage:`)
  for (const [section, items] of Object.entries(bySection).sort(([a], [b]) => parseInt(a) - parseInt(b))) {
    console.log(`  - Section ${section}: ${items.length} pages`)
  }
}

generateIndex().catch(console.error)