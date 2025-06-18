#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import { manPageList as manPages } from '../data/man-pages'

// Get Supabase credentials from environment or command line
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.argv[2]
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.argv[3]

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required credentials!')
  console.error('\nUsage:')
  console.error('  Option 1: Set environment variables')
  console.error('    NEXT_PUBLIC_SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." npx tsx scripts/load-to-supabase.ts')
  console.error('\n  Option 2: Pass as arguments')
  console.error('    npx tsx scripts/load-to-supabase.ts <SUPABASE_URL> <SERVICE_ROLE_KEY>')
  process.exit(1)
}

console.log('🔑 Connecting to Supabase...')
console.log('   URL:', SUPABASE_URL)
console.log('   Using service role key:', SUPABASE_SERVICE_KEY.substring(0, 20) + '...')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function clearExistingData() {
  console.log('\n🧹 Clearing existing data...')
  const { error } = await supabase
    .from('documents')
    .delete()
    .neq('id', 0) // Delete all rows
  
  if (error) {
    console.error('❌ Error clearing data:', error.message)
    throw error
  }
  console.log('✅ Existing data cleared')
}

function determineComplexity(page: any): 'basic' | 'intermediate' | 'advanced' {
  const optionsCount = page.options?.length || 0
  const contentLength = page.content?.length || 0
  const hasExamples = page.examples?.length > 0
  
  if (page.is_common && optionsCount < 10 && contentLength < 5000) {
    return 'basic'
  } else if (optionsCount > 30 || contentLength > 15000 || (optionsCount > 20 && hasExamples)) {
    return 'advanced'
  }
  return 'intermediate'
}

async function loadManPages() {
  console.log('\n🚀 Starting BetterMan data load to Supabase...')
  console.log(`📚 Total pages to load: ${manPages.length}`)
  
  try {
    // Clear existing data first
    await clearExistingData()
    
    // Transform data to match Supabase schema
    console.log('\n🔄 Transforming data...')
    const documents = manPages.map(page => ({
      name: page.name,
      section: page.section,
      title: page.title,
      description: page.description,
      synopsis: page.synopsis || '',
      content: page.sections?.map(s => `${s.title}\n${s.content}`).join('\n\n') || page.description,
      category: page.category,
      is_common: page.isCommon || false,
      complexity: determineComplexity(page),
      keywords: page.keywords || [],
      see_also: page.seeAlso || [],
      related_commands: page.relatedCommands || [],
      examples: page.examples || [],
      options: page.options || [],
      search_content: [
        page.name,
        page.title,
        page.description,
        page.synopsis,
        (page.keywords || []).join(' '),
        (page.related_commands || []).join(' ')
      ].filter(Boolean).join(' ')
    }))
    
    // Upload in batches to avoid timeouts
    console.log('\n📤 Uploading to Supabase...')
    const batchSize = 50
    let successCount = 0
    let errorCount = 0
    const errors: any[] = []
    
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize)
      const batchNum = Math.floor(i / batchSize) + 1
      const totalBatches = Math.ceil(documents.length / batchSize)
      
      process.stdout.write(`\r  Batch ${batchNum}/${totalBatches} (${Math.round((i / documents.length) * 100)}%)...`)
      
      const { data, error } = await supabase
        .from('documents')
        .insert(batch)
        .select()
      
      if (error) {
        console.error(`\n❌ Error in batch ${batchNum}:`, error.message)
        errorCount += batch.length
        errors.push({ 
          batch: batchNum, 
          error: error.message,
          pages: batch.map(d => `${d.name}(${d.section})`)
        })
      } else {
        successCount += data?.length || 0
      }
    }
    
    console.log('\n')
    
    // Show summary
    console.log('\n📊 Upload Summary')
    console.log('─'.repeat(50))
    console.log(`✅ Successfully uploaded: ${successCount} documents`)
    console.log(`❌ Failed to upload: ${errorCount} documents`)
    console.log(`📈 Success rate: ${Math.round((successCount / documents.length) * 100)}%`)
    
    if (errors.length > 0) {
      console.log('\n⚠️  Errors encountered:')
      errors.forEach(({ batch, error, pages }) => {
        console.log(`  Batch ${batch}: ${error}`)
        if (pages.length < 5) {
          console.log(`    Pages: ${pages.join(', ')}`)
        }
      })
    }
    
    // Verify the upload
    console.log('\n🔍 Verifying database...')
    const { count, error: countError } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
    
    if (countError) {
      console.error('❌ Error verifying:', countError.message)
    } else {
      console.log(`✅ Total documents in database: ${count}`)
      
      // Sample search test
      console.log('\n🧪 Testing search function...')
      const { data: searchTest, error: searchError } = await supabase
        .from('documents')
        .select('name, section, title')
        .ilike('name', '%git%')
        .limit(5)
      
      if (searchError) {
        console.error('❌ Search test failed:', searchError.message)
      } else {
        console.log(`✅ Search test passed! Found ${searchTest?.length || 0} git-related commands`)
        if (searchTest && searchTest.length > 0) {
          console.log('   Examples:', searchTest.map(d => d.name).join(', '))
        }
      }
    }
    
    console.log('\n✨ Data load complete!')
    console.log('\n📝 Next steps:')
    console.log('1. Update your Vercel environment variables:')
    console.log('   NEXT_PUBLIC_USE_SUPABASE=true')
    console.log('   NEXT_PUBLIC_API_ENABLED=false')
    console.log('2. Deploy to Vercel: git push origin main')
    console.log('3. Your app will now use Supabase for all data!')
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

// Run the loader
loadManPages()