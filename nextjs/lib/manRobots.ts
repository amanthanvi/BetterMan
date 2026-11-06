/** The stored demand tier excludes provider alternates; absent signals retain legacy indexing. */
export function isIndexable(page: object): boolean {
  return (page as { indexable?: unknown }).indexable !== false
}
