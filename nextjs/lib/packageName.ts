/** Imported distro package names, bounded before entering a persistent cache key. */
export function packageName(value: string | null | undefined): string | undefined {
  return value && value.trim() === value && value.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9+_.-]*$/.test(value) ? value : undefined
}
