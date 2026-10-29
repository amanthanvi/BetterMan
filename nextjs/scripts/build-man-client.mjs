// Builds the man page script (man-client/) into public/_bm, the static bundle the
// plain-HTML man pages load. next.config.ts runs this when Next builds or starts
// its dev server; `next start` never does, so production installs need no esbuild.
import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const OUT_DIR = 'public/_bm'

function options(root, dev) {
  return {
    entryPoints: [path.join(root, 'man-client/index.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: !dev,
    legalComments: 'none',
    charset: 'utf8',
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
    logLevel: 'warning',
    tsconfig: path.join(root, 'tsconfig.json'),
  }
}

/** Production: one content-hashed file, so it can be cached for good. Returns its URL path. */
export async function buildManClient(root) {
  const { build } = await import('esbuild')
  const result = await build({ ...options(root, false), write: false })
  const code = result.outputFiles[0].contents
  const name = `man.${createHash('sha256').update(code).digest('hex').slice(0, 16)}.js`
  const outDir = path.join(root, OUT_DIR)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, name), code)
  return `/_bm/${name}`
}

/** Development: an unhashed file, rebuilt on every change. One watcher per process. */
export async function watchManClient(root) {
  const key = Symbol.for('betterman.manClientWatcher')
  if (!globalThis[key]) {
    const { context } = await import('esbuild')
    const outDir = path.join(root, OUT_DIR)
    await rm(outDir, { recursive: true, force: true })
    const ctx = await context({ ...options(root, true), outfile: path.join(outDir, 'man.js') })
    await ctx.rebuild()
    await ctx.watch()
    globalThis[key] = ctx
  }
  return '/_bm/man.js'
}
