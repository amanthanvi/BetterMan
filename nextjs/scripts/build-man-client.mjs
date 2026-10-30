// Builds the man page script (man-client/) into public/_bm, the static bundle the plain-HTML man
// pages load. next.config.ts runs this when Next builds or starts its dev server; `next start` never
// does, so production installs need no esbuild.
//
// One bundle per language (man-i18n.mjs): English has no dictionary and no message wrappers, so it
// costs what it always did; each other language embeds its own strings, and a page loads only its own.
import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { eraseMessagesPlugin } from './man-i18n.mjs'

const OUT_DIR = 'public/_bm'
const TRANSLATED = ['de', 'fr', 'es', 'pt-BR', 'ja', 'ru']

function options(root, dev, lang, dictionary) {
  return {
    entryPoints: [path.join(root, 'man-client/index.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: !dev,
    legalComments: 'none',
    charset: 'utf8',
    define: {
      'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
      __BM_DICT__: dictionary ? JSON.stringify(dictionary) : 'null',
      __BM_LANG__: JSON.stringify(lang),
    },
    plugins: dictionary ? [] : [eraseMessagesPlugin()],
    logLevel: 'warning',
    tsconfig: path.join(root, 'tsconfig.json'),
  }
}

/** Each translated language's strings, as the browser reads them (plurals already expanded). */
async function dictionaries(root) {
  const { build } = await import('esbuild')
  const result = await build({
    stdin: {
      contents: "export { loadCatalog } from './lib/i18n/server.ts'\nexport { expandPlurals } from './lib/i18n/expand.ts'",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'warning',
    tsconfig: path.join(root, 'tsconfig.json'),
  })
  const source = Buffer.from(result.outputFiles[0].contents).toString('base64')
  const { loadCatalog, expandPlurals } = await import(`data:text/javascript;base64,${source}`)
  const out = {}
  for (const lang of TRANSLATED) out[lang] = expandPlurals((await loadCatalog(lang)).man)
  return out
}

/** Production: content-hashed files, so they can be cached for good. Returns each language's URL path. */
export async function buildManClient(root) {
  const { build } = await import('esbuild')
  const dictionary = await dictionaries(root)
  const outDir = path.join(root, OUT_DIR)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  const urls = {}
  for (const lang of ['en', ...TRANSLATED]) {
    const result = await build({ ...options(root, false, lang, dictionary[lang]), write: false })
    const code = result.outputFiles[0].contents
    const name = `man${lang === 'en' ? '' : `.${lang}`}.${createHash('sha256').update(code).digest('hex').slice(0, 16)}.js`
    await writeFile(path.join(outDir, name), code)
    urls[lang] = `/_bm/${name}`
  }
  return urls
}

/** Development: unhashed files, rebuilt on every change. One set of watchers per process. */
export async function watchManClient(root) {
  const key = Symbol.for('betterman.manClientWatchers')
  if (!globalThis[key]) {
    const { context } = await import('esbuild')
    const dictionary = await dictionaries(root)
    const outDir = path.join(root, OUT_DIR)
    await rm(outDir, { recursive: true, force: true })
    const urls = {}
    const contexts = []
    for (const lang of ['en', ...TRANSLATED]) {
      const file = `man${lang === 'en' ? '' : `.${lang}`}.js`
      const ctx = await context({ ...options(root, true, lang, dictionary[lang]), outfile: path.join(outDir, file) })
      await ctx.rebuild()
      await ctx.watch()
      contexts.push(ctx)
      urls[lang] = `/_bm/${file}`
    }
    globalThis[key] = urls
  }
  return globalThis[key]
}
