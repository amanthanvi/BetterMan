// Web Worker for search operations
import Fuse from 'fuse.js'
import type { ManPageIndex } from '@/lib/search/enhanced-search'

let fuseInstance: Fuse<any> | null = null
let searchData: ManPageIndex | null = null

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data

  switch (type) {
    case 'INIT':
      searchData = payload.data
      fuseInstance = new Fuse(Object.values(searchData.commands), {
        keys: [
          { name: 'name', weight: 0.6 },
          { name: 'title', weight: 0.3 },
          { name: 'keywords', weight: 0.1 },
        ],
        threshold: 0.4,
        includeScore: true,
        includeMatches: true,
        minMatchCharLength: 2,
        useExtendedSearch: true,
      })
      self.postMessage({ type: 'INIT_COMPLETE' })
      break

    case 'SEARCH':
      if (!fuseInstance || !searchData) {
        self.postMessage({ type: 'SEARCH_RESULT', results: [] })
        return
      }

      const { query, options } = payload
      const results = performSearch(query, options)
      self.postMessage({ type: 'SEARCH_RESULT', results })
      break
  }
})

function performSearch(query: string, options: any) {
  if (!fuseInstance || !searchData) return []

  // Exact name search
  const exactMatch = searchData.commands[`${query}.1`] ||
    searchData.commands[`${query}.2`] ||
    searchData.commands[`${query}.3`]

  if (exactMatch) {
    return [{
      ...exactMatch,
      id: `${exactMatch.name}.${exactMatch.section}`,
      score: 0,
      isExactMatch: true,
      searchStrategy: 'exact',
    }]
  }

  // Fuzzy search
  const fuseResults = fuseInstance.search(query)
  const results = fuseResults.map(result => ({
    ...result.item,
    id: `${result.item.name}.${result.item.section}`,
    score: result.score || 0,
    matches: result.matches,
    searchStrategy: 'fuzzy',
  }))

  // Apply filters
  let filtered = results
  if (options.section) {
    filtered = filtered.filter(r => r.section === options.section)
  }
  if (options.complexity) {
    filtered = filtered.filter(r => r.complexity === options.complexity)
  }
  if (options.category) {
    filtered = filtered.filter(r => r.category === options.category)
  }

  // Limit results
  return filtered.slice(0, options.limit || 20)
}