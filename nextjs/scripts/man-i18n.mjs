// The man page script's languages are built, not looked up. English is the message written where it is
// used, so its bundle erases the `t('…')` wrapper (and carries no dictionary); each other language is its
// own bundle that embeds that language's strings. A page loads only the script for its language, so
// English readers pay nothing for a feature they do not use (docs/i18n.md).
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const CONTEXT = '\u0004'
const LITERAL = String.raw`'(?:[^'\\\n]|\\.)*'`
// A call of the translator with only a message: `t('Find in page')`. Not `.t(`, and not one with values.
const PLAIN = new RegExp(String.raw`(?<![\w.$])t\(\s*(${LITERAL})\s*\)`, 'g')
// A plural: `tn('{count, plural, …}', n, english)`; English keeps its own text, so the message goes.
const PLURAL = new RegExp(String.raw`(?<![\w.$])tn\(\s*${LITERAL}\s*,`, 'g')

const ESCAPES = { n: '\n', t: '\t', r: '\r', '0': '\0' }

/** The value of a single-quoted string literal in our own sources (no evaluation). */
function unquote(literal) {
  return literal.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, escape) =>
    /^[ux]/.test(escape) && escape.length > 1 ? String.fromCharCode(Number.parseInt(escape.slice(1), 16)) : (ESCAPES[escape] ?? escape),
  )
}

const OPENING = new RegExp(String.raw`(?<![\w.$])t\(\s*(${LITERAL})\s*,\s*\{`, 'g')

/** The index of the bracket that closes the one at `open`, skipping strings and templates; -1 if unbalanced. */
function closing(source, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' }
  const stack = [pairs[source[open]]]
  for (let i = open + 1; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i += 1; i < source.length && source[i] !== ch; i += 1) if (source[i] === '\\') i += 1
    } else if (pairs[ch]) {
      stack.push(pairs[ch])
    } else if (ch === stack[stack.length - 1]) {
      stack.pop()
      if (!stack.length) return i
    }
  }
  return -1
}

/** `{ a, b: expr }` as a map of name to expression, or null when it is anything else. */
function entries(body) {
  const out = new Map()
  let depth = 0
  let start = 0
  const parts = []
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i += 1; i < body.length && body[i] !== ch; i += 1) if (body[i] === '\\') i += 1
    } else if ('([{'.includes(ch)) depth += 1
    else if (')]}'.includes(ch)) depth -= 1
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(body.slice(start).trim())
  for (const part of parts.filter(Boolean)) {
    const match = /^(\w+)\s*(?::\s*([\s\S]+))?$/.exec(part)
    if (!match) return null
    out.set(match[1], match[2] ?? match[1])
  }
  return out
}

/** `t('Added {flag}.', { flag })` as the template the code wrote before there were languages. */
function inlineValues(source) {
  let out = ''
  let last = 0
  OPENING.lastIndex = 0
  for (let match = OPENING.exec(source); match; match = OPENING.exec(source)) {
    const open = match.index + match[0].length - 1
    const objectEnd = closing(source, open)
    const callEnd = source.slice(objectEnd + 1).match(/^\s*\)/)
    const vars = objectEnd < 0 || !callEnd ? null : entries(source.slice(open + 1, objectEnd))
    const message = unquote(match[1])
    const names = [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
    if (!vars || names.some((name) => !vars.has(name)) || /[{}]/.test(message.replace(/\{\w+\}/g, ''))) continue
    const text = message.slice(message.indexOf(CONTEXT) + 1).replace(/[\\`]|\$\{/g, (c) => `\\${c}`)
    const template = `\`${text.replace(/\{(\w+)\}/g, (_, name) => `\${${vars.get(name)}}`)}\``
    out += source.slice(last, match.index) + template
    last = objectEnd + 1 + callEnd[0].length
    OPENING.lastIndex = last
  }
  return out + source.slice(last)
}

/** The English bundle's source: messages stand as their text, with no wrapper to run. */
export function eraseMessages(source) {
  return inlineValues(source)
    .replace(PLAIN, (_, literal) => {
      const message = unquote(literal)
      return JSON.stringify(message.slice(message.indexOf(CONTEXT) + 1))
    })
    .replace(PLURAL, 'tn(0,')
}

/** An esbuild plugin that erases messages in the sources the man page script bundles. */
export function eraseMessagesPlugin() {
  return {
    name: 'bm-erase-messages',
    setup(build) {
      build.onLoad({ filter: /\.tsx?$/ }, async ({ path: file }) => {
        if (file.includes(`${path.sep}node_modules${path.sep}`) || /\.test\.tsx?$/.test(file)) return undefined
        const source = await readFile(file, 'utf8')
        const erased = eraseMessages(source)
        return erased === source ? undefined : { contents: erased, loader: file.endsWith('x') ? 'tsx' : 'ts' }
      })
    },
  }
}
