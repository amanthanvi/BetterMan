import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const assetsDir = path.resolve(process.cwd(), 'dist', 'assets')

if (!existsSync(assetsDir)) {
  console.log(`[bundle] No assets dir at ${assetsDir} (did you run the build?)`)
  process.exit(0)
}

/** @type {Array<{ name: string; ext: string; bytes: number; gzipBytes: number }>} */
const assets = []

for (const name of readdirSync(assetsDir)) {
  const ext = path.extname(name).toLowerCase()
  if (!['.js', '.css'].includes(ext)) continue

  const full = path.join(assetsDir, name)
  const buf = readFileSync(full)
  const gz = gzipSync(buf)
  assets.push({ name, ext, bytes: buf.byteLength, gzipBytes: gz.byteLength })
}

assets.sort((a, b) => b.bytes - a.bytes)

const sum = (xs) => xs.reduce((acc, x) => acc + x, 0)
const fmt = (bytes) => `${(bytes / 1024).toFixed(2)} kB`

const js = assets.filter((a) => a.ext === '.js')
const css = assets.filter((a) => a.ext === '.css')

console.log('')
console.log('[bundle] Frontend assets (dist/assets)')
console.log(`[bundle] JS total:  ${fmt(sum(js.map((a) => a.bytes)))} (gzip ${fmt(sum(js.map((a) => a.gzipBytes)))})`)
console.log(`[bundle] CSS total: ${fmt(sum(css.map((a) => a.bytes)))} (gzip ${fmt(sum(css.map((a) => a.gzipBytes)))})`)

const top = assets.slice(0, 12)
if (!top.length) {
  console.log('[bundle] No .js/.css assets found.')
  process.exit(0)
}

console.log('')
console.log('[bundle] Largest assets (raw / gzip)')
for (const a of top) {
  console.log(`[bundle] - ${a.name}: ${fmt(a.bytes)} / ${fmt(a.gzipBytes)}`)
}
