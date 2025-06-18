#!/usr/bin/env tsx

import fs from 'fs/promises'
import path from 'path'

const PAGES_PATH = path.join(process.cwd(), 'data', 'man-pages', 'enhanced-pages.ts')

interface ValidationIssue {
  page: string
  section: number
  type: string
  message: string
}

async function validateManPages() {
  console.log('🔍 Validating man pages data...\n')
  
  // Read the data
  const content = await fs.readFile(PAGES_PATH, 'utf-8')
  const match = content.match(/export const enhancedManPages: ManPage\[\] = (\[[\s\S]+?\])\n\nexport/)
  
  if (!match) {
    throw new Error('Could not extract man pages data')
  }
  
  const pages = JSON.parse(match[1])
  const issues: ValidationIssue[] = []
  
  // Track duplicates
  const seen = new Map<string, number>()
  
  for (const page of pages) {
    const key = `${page.name}-${page.section}`
    
    // Check for duplicate entries
    if (seen.has(key)) {
      issues.push({
        page: page.name,
        section: page.section,
        type: 'duplicate',
        message: 'Duplicate man page entry'
      })
    }
    seen.set(key, (seen.get(key) || 0) + 1)
    
    // Validate required fields
    if (!page.name || page.name.trim().length === 0) {
      issues.push({
        page: page.name || 'unknown',
        section: page.section,
        type: 'missing-field',
        message: 'Missing or empty name'
      })
    }
    
    if (!page.description || page.description.trim().length < 10) {
      issues.push({
        page: page.name,
        section: page.section,
        type: 'invalid-field',
        message: 'Description too short or missing'
      })
    }
    
    // Check for self-references in seeAlso
    if (page.seeAlso && Array.isArray(page.seeAlso)) {
      const selfRefs = page.seeAlso.filter((ref: any) => 
        ref.name && ref.name.toLowerCase() === page.name.toLowerCase()
      )
      
      if (selfRefs.length > 0) {
        issues.push({
          page: page.name,
          section: page.section,
          type: 'self-reference',
          message: `Self-reference in seeAlso: ${selfRefs.map((r: any) => `${r.name}(${r.section})`).join(', ')}`
        })
      }
      
      // Check for invalid seeAlso structure
      const invalidRefs = page.seeAlso.filter((ref: any) => 
        !ref || typeof ref !== 'object' || !ref.name || typeof ref.section !== 'number'
      )
      
      if (invalidRefs.length > 0) {
        issues.push({
          page: page.name,
          section: page.section,
          type: 'invalid-structure',
          message: 'Invalid seeAlso reference structure'
        })
      }
    }
    
    // Check for self-references in relatedCommands
    if (page.relatedCommands && Array.isArray(page.relatedCommands)) {
      const selfRelated = page.relatedCommands.filter((cmd: string) => 
        cmd.toLowerCase() === page.name.toLowerCase()
      )
      
      if (selfRelated.length > 0) {
        issues.push({
          page: page.name,
          section: page.section,
          type: 'self-reference',
          message: `Self-reference in relatedCommands: ${selfRelated.join(', ')}`
        })
      }
    }
    
    // Check for parsing artifacts
    const contentToCheck = [
      page.description,
      page.synopsis,
      ...(page.sections || []).map((s: any) => s.content || ''),
      ...(page.examples || [])
    ].join(' ')
    
    if (contentToCheck.includes('\\f') || contentToCheck.includes('.SH') || contentToCheck.includes('.SS')) {
      issues.push({
        page: page.name,
        section: page.section,
        type: 'parsing-artifact',
        message: 'Contains groff/troff formatting artifacts'
      })
    }
    
    // Check for empty sections
    if (page.sections && Array.isArray(page.sections)) {
      const emptySecions = page.sections.filter((s: any) => 
        !s.content || s.content.trim().length < 5
      )
      
      if (emptySecions.length > 0) {
        issues.push({
          page: page.name,
          section: page.section,
          type: 'empty-section',
          message: `Empty sections: ${emptySecions.map((s: any) => s.title).join(', ')}`
        })
      }
    }
  }
  
  // Generate report
  console.log(`✅ Validated ${pages.length} man pages\n`)
  
  if (issues.length === 0) {
    console.log('🎉 All validations passed!')
  } else {
    console.log(`⚠️  Found ${issues.length} issues:\n`)
    
    // Group by type
    const byType = issues.reduce((acc, issue) => {
      if (!acc[issue.type]) {
        acc[issue.type] = []
      }
      acc[issue.type].push(issue)
      return acc
    }, {} as Record<string, ValidationIssue[]>)
    
    for (const [type, typeIssues] of Object.entries(byType)) {
      console.log(`\n${type.replace(/-/g, ' ').toUpperCase()} (${typeIssues.length})`)
      console.log('─'.repeat(60))
      
      for (const issue of typeIssues.slice(0, 5)) {
        console.log(`  ${issue.page}(${issue.section}): ${issue.message}`)
      }
      
      if (typeIssues.length > 5) {
        console.log(`  ... and ${typeIssues.length - 5} more`)
      }
    }
  }
  
  // Save validation report
  const reportPath = path.join(path.dirname(PAGES_PATH), 'validation-report.json')
  const issuesByType = issues.length > 0 ? Object.entries(byType).map(([type, list]) => ({
    type,
    count: list.length,
    examples: list.slice(0, 10)
  })) : []
  
  await fs.writeFile(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalPages: pages.length,
    totalIssues: issues.length,
    issuesByType,
    passed: issues.length === 0
  }, null, 2))
  
  console.log(`\n📄 Validation report saved to: ${reportPath}`)
  
  // Exit with error if issues found
  if (issues.length > 0) {
    process.exit(1)
  }
}

validateManPages().catch(console.error)