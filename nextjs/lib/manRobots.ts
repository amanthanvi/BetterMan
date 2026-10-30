/**
 * The index tier a page carries. B4 (#396) adds `indexable` to page data and
 * serves the long tail with noindex; until a release carries it, every page
 * indexes. Provider rows carry indexable=false; misses are always noindex.
 */
export function isIndexable(page: object): boolean {
  return (page as { indexable?: unknown }).indexable !== false
}
