import { readdirSync } from 'node:fs'
import path from 'node:path'

// Root files Next.js serves at a path of their own (metadata images and routes).
const METADATA_FILE = /^(?:favicon|icon|apple-icon|opengraph-image|twitter-image|sitemap|robots|manifest)\./

/**
 * First path segments that `app/` or `public/` already answer under. Read at
 * build time by `next.config.ts`, so a new top-level route or asset is never
 * taken for a short man page URL.
 */
export function reservedPathSegments(projectDir: string): string[] {
  const segments = new Set(['_next'])
  const visitApp = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('(')) visitApp(path.join(dir, entry.name))
        else if (!/^[[@_]/.test(entry.name)) segments.add(entry.name)
      } else if (METADATA_FILE.test(entry.name)) {
        segments.add(entry.name.slice(0, entry.name.indexOf('.')))
      }
    }
  }
  visitApp(path.join(projectDir, 'app'))
  for (const name of readdirSync(path.join(projectDir, 'public'))) segments.add(name)
  return [...segments].map((segment) => segment.toLowerCase()).sort()
}
