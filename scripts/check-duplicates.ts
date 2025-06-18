#!/usr/bin/env tsx

import fs from 'fs/promises'
import path from 'path'
import { EnhancedManPage } from '../lib/parser/enhanced-man-parser'

const PARSED_DIR = path.join(process.cwd(), 'data', 'parsed-man-pages', 'json')

interface DuplicateIssue {
  command: string
  section: number
  issue: string
  details: string[]
}

async function checkDuplicates() {
  console.log('🔍 Checking for duplicate and self-reference issues...\n')
  
  const files = await fs.readdir(PARSED_DIR)
  const jsonFiles = files.filter(f => f.endsWith('.json'))
  
  const issues: DuplicateIssue[] = []
  let checkedCount = 0
  
  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(path.join(PARSED_DIR, file), 'utf-8')
      const page: EnhancedManPage = JSON.parse(content)
      
      // Check for self-references in seeAlso
      const selfRefs = page.seeAlso.filter(ref => 
        ref.name.toLowerCase() === page.name.toLowerCase()
      )
      
      if (selfRefs.length > 0) {
        issues.push({
          command: page.name,
          section: page.section,
          issue: 'Self-reference in seeAlso',
          details: selfRefs.map(ref => `${ref.name}(${ref.section})`)
        })
      }
      
      // Check for duplicates in seeAlso
      const seeAlsoKeys = new Set<string>()
      const duplicates: string[] = []
      
      for (const ref of page.seeAlso) {
        const key = `${ref.name}-${ref.section}`
        if (seeAlsoKeys.has(key)) {
          duplicates.push(`${ref.name}(${ref.section})`)
        } else {
          seeAlsoKeys.add(key)
        }
      }
      
      if (duplicates.length > 0) {
        issues.push({
          command: page.name,
          section: page.section,
          issue: 'Duplicate entries in seeAlso',
          details: duplicates
        })
      }
      
      // Check for self-references in relatedCommands
      const selfRelated = page.relatedCommands.filter(cmd => 
        cmd.toLowerCase() === page.name.toLowerCase()
      )
      
      if (selfRelated.length > 0) {
        issues.push({
          command: page.name,
          section: page.section,
          issue: 'Self-reference in relatedCommands',
          details: selfRelated
        })
      }
      
      // Check for empty or malformed sections
      const emptySecions = page.sections.filter(section => 
        !section.content || 
        section.content.trim().length < 5 ||
        section.content.match(/^(macOS|Linux)\s+\d+\.\d+.*\d{4}\s*$/i)
      )
      
      if (emptySecions.length > 0) {
        issues.push({
          command: page.name,
          section: page.section,
          issue: 'Empty or malformed sections',
          details: emptySecions.map(s => s.title)
        })
      }
      
      // Check for parsing artifacts
      const hasArtifacts = page.sections.some(section => 
        section.content.includes('\\f') ||
        section.content.includes('.SH') ||
        section.content.includes('.SS') ||
        section.content.includes('.TH')
      )
      
      if (hasArtifacts) {
        issues.push({
          command: page.name,
          section: page.section,
          issue: 'Contains groff/troff artifacts',
          details: ['Content needs better cleaning']
        })
      }
      
      checkedCount++
      
    } catch (error) {
      console.error(`Error checking ${file}:`, error)
    }
  }
  
  // Generate report
  console.log(`✅ Checked ${checkedCount} man pages\n`)
  
  if (issues.length === 0) {
    console.log('🎉 No issues found!')
  } else {
    console.log(`⚠️  Found ${issues.length} issues:\n`)
    
    // Group by issue type
    const issuesByType = issues.reduce((acc, issue) => {
      if (!acc[issue.issue]) {
        acc[issue.issue] = []
      }
      acc[issue.issue].push(issue)
      return acc
    }, {} as Record<string, DuplicateIssue[]>)
    
    for (const [issueType, issueList] of Object.entries(issuesByType)) {
      console.log(`\n${issueType} (${issueList.length} pages)`)
      console.log('─'.repeat(50))
      
      for (const issue of issueList.slice(0, 10)) {
        console.log(`  ${issue.command}(${issue.section}):`)
        issue.details.forEach(detail => {
          console.log(`    - ${detail}`)
        })
      }
      
      if (issueList.length > 10) {
        console.log(`  ... and ${issueList.length - 10} more`)
      }
    }
  }
  
  // Save detailed report
  const reportPath = path.join(path.dirname(PARSED_DIR), 'duplicate-check-report.json')
  await fs.writeFile(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalChecked: checkedCount,
    totalIssues: issues.length,
    issuesByType: Object.entries(issuesByType).map(([type, list]) => ({
      type,
      count: list.length,
      examples: list.slice(0, 5)
    })),
    allIssues: issues
  }, null, 2))
  
  console.log(`\n📄 Detailed report saved to: ${reportPath}`)
}

checkDuplicates().catch(console.error)