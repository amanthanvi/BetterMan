#!/usr/bin/env node
// Compiles the concept explainers in content/concepts/*.md into lib/concepts.generated.json.
// The Markdown is the reviewed source; the JSON is what the app bundles, so a page that
// shows a concept needs no read beyond the code. `--check` fails when the JSON is stale.
// Format and review flow: content/concepts/README.md.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CONTENT_DIR = path.join(ROOT, 'content', 'concepts')
export const OUTPUT_FILE = path.join(ROOT, 'lib', 'concepts.generated.json')

export const STATUSES = ['draft', 'pending-owner', 'approved']
const SCALARS = ['slug', 'title', 'term', 'summary', 'status', 'generated-by', 'generated-on', 'panel-review']
const LISTS = ['related', 'aliases', 'references', 'headings', 'pages']
const SOURCE_KEYS = ['page', 'package', 'distros', 'sections']
const DISTROS = ['debian', 'ubuntu', 'fedora', 'arch', 'alpine', 'freebsd', 'macos']
export const MIN_WORDS = 100
export const MAX_WORDS = 260

const REF_RE = /^([A-Za-z0-9_.:+-]+)\(([1-9][a-z0-9]*)\)$/
const INLINE_REF_RE = /(?<![\w.:+-])([a-z][a-z0-9_.+-]*[a-z0-9])\(([1-9][a-z0-9]*)\)/g

function fail(file, message) {
  throw new Error(`${path.basename(file)}: ${message}`)
}

function parseRef(file, value) {
  const m = REF_RE.exec(value.trim())
  if (!m) fail(file, `expected a man page citation like signal(7), got "${value}"`)
  return { name: m[1], section: m[2] }
}

function splitList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

/** A deliberately small front matter dialect: `key: value`, comma lists, and one list of maps (`sources`). */
function parseFrontMatter(file, text) {
  const out = {}
  let sources = null
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trim()) continue
    const where = `front matter line ${index + 2}`
    const entry = sources && /^ {2}- ([a-z-]+): (.*)$/.exec(line)
    if (entry) {
      sources.push({ [entry[1]]: entry[2].trim() })
      continue
    }
    const field = sources?.length && /^ {4}([a-z-]+): (.*)$/.exec(line)
    if (field) {
      sources.at(-1)[field[1]] = field[2].trim()
      continue
    }
    const m = /^([a-z-]+):(?: (.*))?$/.exec(line)
    if (!m) fail(file, `${where}: cannot read "${line}"`)
    const [, key, value = ''] = m
    if (key in out) fail(file, `${where}: duplicate key ${key}`)
    if (key === 'sources') {
      if (value.trim()) fail(file, `${where}: sources is a list of entries`)
      sources = []
      out.sources = sources
      continue
    }
    sources = null
    if (!SCALARS.includes(key) && !LISTS.includes(key)) fail(file, `${where}: unknown key ${key}`)
    out[key] = value.trim()
  }
  return out
}

function parseInlines(file, text, slugs) {
  const out = []
  const push = (node) => {
    const last = out.at(-1)
    if (node.t === 'text' && last?.t === 'text') last.v += node.v
    else if (node.t !== 'text' || node.v) out.push(node)
  }
  const plain = (value) => {
    let last = 0
    for (const m of value.matchAll(INLINE_REF_RE)) {
      push({ t: 'text', v: value.slice(last, m.index) })
      push({ t: 'man', name: m[1], section: m[2] })
      last = m.index + m[0].length
    }
    push({ t: 'text', v: value.slice(last) })
  }
  // Code spans first, so nothing inside backticks is read as markup.
  const TOKEN_RE = /`([^`]+)`|\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]|\*([^*\s][^*]*?)\*/g
  let last = 0
  for (const m of text.matchAll(TOKEN_RE)) {
    plain(text.slice(last, m.index))
    if (m[1] !== undefined) push({ t: 'code', v: m[1] })
    else if (m[2] !== undefined) {
      if (!slugs.has(m[2])) fail(file, `[[${m[2]}]] names no concept`)
      push({ t: 'concept', slug: m[2], v: m[3] ?? m[2] })
    } else push({ t: 'em', v: m[4] })
    last = m.index + m[0].length
  }
  plain(text.slice(last))
  if (out.some((node) => node.t === 'text' && /`|\[\[|\]\]/.test(node.v))) fail(file, `unbalanced markup in "${text}"`)
  return out
}

/** Paragraphs, `-` and `1.` lists (two-space continuation lines) and ``` fences; nothing else. */
function parseBody(file, text, slugs) {
  const blocks = []
  const lines = text.replace(/\s+$/, '').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    if (line.startsWith('```')) {
      const end = lines.indexOf('```', i + 1)
      if (line !== '```' || end < 0) fail(file, 'a code fence opens with ``` alone and must close')
      blocks.push({ type: 'pre', text: lines.slice(i + 1, end).join('\n') })
      i = end + 1
      continue
    }
    const item = /^(-|\d+\.) /.exec(line)
    if (item) {
      const ordered = item[1] !== '-'
      const items = []
      while (i < lines.length && /^(-|\d+\.) /.test(lines[i])) {
        if (/^\d+\. /.test(lines[i]) !== ordered) fail(file, 'a list mixes - and numbered items')
        let value = lines[i].replace(/^(-|\d+\.) /, '')
        i += 1
        while (i < lines.length && /^ {2,3}\S/.test(lines[i])) value += ` ${lines[i++].trim()}`
        items.push(parseInlines(file, value, slugs))
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items })
      continue
    }
    let value = line.trim()
    i += 1
    while (i < lines.length && lines[i].trim() && !/^(-|\d+\.) |^```/.test(lines[i])) value += ` ${lines[i++].trim()}`
    blocks.push({ type: 'p', inlines: parseInlines(file, value, slugs) })
  }
  return blocks
}

function countWords(blocks) {
  const text = (nodes) => nodes.map((n) => (n.t === 'man' ? `${n.name}(${n.section})` : n.v)).join('')
  return blocks
    .flatMap((b) => (b.type === 'pre' ? [b.text] : b.type === 'p' ? [text(b.inlines)] : b.items.map(text)))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length
}

function parseConcept(file, raw, slugs) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw.replace(/\r\n/g, '\n'))
  if (!m) fail(file, 'expected front matter between --- lines')
  const fm = parseFrontMatter(file, m[1])
  for (const key of ['slug', 'title', 'term', 'summary', 'status', 'generated-by', 'generated-on']) {
    if (!fm[key]) fail(file, `${key} is required`)
  }
  if (`${fm.slug}.md` !== path.basename(file)) fail(file, `slug ${fm.slug} must match the file name`)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fm.slug)) fail(file, 'slug is lowercase words joined by -')
  if (!STATUSES.includes(fm.status)) fail(file, `status is one of ${STATUSES.join(', ')}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm['generated-on'])) fail(file, 'generated-on is YYYY-MM-DD')
  if (/`|\[\[/.test(fm.summary)) fail(file, 'summary is plain text, without markup')
  if (!fm.sources?.length) fail(file, 'at least one source is required')
  const sources = fm.sources.map((source) => {
    for (const key of Object.keys(source)) if (!SOURCE_KEYS.includes(key)) fail(file, `unknown source key ${key}`)
    if (!source.page || !source.distros || !source.sections) fail(file, 'each source needs page, distros and sections')
    const distros = splitList(source.distros)
    for (const distro of distros) if (!DISTROS.includes(distro)) fail(file, `unknown distro ${distro}`)
    return { page: parseRef(file, source.page), package: source.package ?? null, distros, sections: source.sections }
  })
  const refs = (key) => splitList(fm[key] ?? '').map((value) => parseRef(file, value))
  const body = parseBody(file, m[2], slugs)
  const words = countWords(body)
  if (words < MIN_WORDS || words > MAX_WORDS) fail(file, `body has ${words} words; keep it between ${MIN_WORDS} and ${MAX_WORDS}`)
  return {
    slug: fm.slug,
    title: fm.title,
    term: fm.term,
    summary: fm.summary,
    status: fm.status,
    generatedBy: fm['generated-by'],
    generatedOn: fm['generated-on'],
    panelReview: fm['panel-review'] ?? null,
    sources,
    related: refs('related'),
    aliases: splitList(fm.aliases ?? '').map((alias) => alias.toLowerCase()),
    references: refs('references'),
    headings: splitList(fm.headings ?? '').map((heading) => heading.toUpperCase()),
    pages: refs('pages'),
    words,
    body,
  }
}

export function buildConcepts(dir = CONTENT_DIR) {
  const files = readdirSync(dir).filter((name) => name.endsWith('.md') && name !== 'README.md').sort()
  const slugs = new Set(files.map((name) => name.slice(0, -3)))
  const concepts = files.map((name) => parseConcept(path.join(dir, name), readFileSync(path.join(dir, name), 'utf8'), slugs))
  return { concepts }
}

export function serialize(data) {
  return `${JSON.stringify(data, null, 1)}\n`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const next = serialize(buildConcepts())
  if (process.argv.includes('--check')) {
    let current = ''
    try {
      current = readFileSync(OUTPUT_FILE, 'utf8')
    } catch {}
    if (current !== next) {
      console.error('lib/concepts.generated.json is out of date. Run pnpm concepts:build and commit it.')
      process.exit(1)
    }
  } else {
    writeFileSync(OUTPUT_FILE, next)
    console.log(`Wrote ${path.relative(process.cwd(), OUTPUT_FILE)}`)
  }
}
