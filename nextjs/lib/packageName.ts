/** Debian binary package names, bounded before entering a persistent cache key. */
export function packageName(value: string | null | undefined): string | undefined {
  return value && value.trim() === value && value.length >= 2 && value.length <= 200 && /^[a-z0-9][a-z0-9+.-]+$/.test(value) ? value : undefined
}
