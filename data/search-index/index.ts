// Auto-generated search index
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