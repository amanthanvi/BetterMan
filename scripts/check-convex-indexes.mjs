import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return ts.isStringLiteral(node) ? node.text : Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal)
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) throw new Error('Index options must be literal properties')
    return [property.name.text, literal(property.initializer)]
  }).sort(([a], [b]) => a.localeCompare(b)))
  throw new Error('Index definitions must be literal; cannot establish deployment safety')
}

// Inspect syntax without executing the target schema or relying on Convex evaluation.
export function schemaIndexes(source) {
  const file = ts.createSourceFile('schema.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if (file.parseDiagnostics.length) throw new Error('Cannot parse Convex schema')
  const schema = file.statements.find(ts.isExportAssignment)?.expression
  if (!schema || !ts.isCallExpression(schema) || !ts.isIdentifier(schema.expression) || schema.expression.text !== 'defineSchema' || !schema.arguments[0] || !ts.isObjectLiteralExpression(schema.arguments[0])) throw new Error('Expected a literal defineSchema export')
  const tables = new Set()
  return Object.fromEntries(schema.arguments[0].properties.map(table => {
    if (!ts.isPropertyAssignment(table) || !ts.isIdentifier(table.name) && !ts.isStringLiteral(table.name)) throw new Error('Schema tables must be literal properties')
    if (tables.has(table.name.text)) throw new Error('Duplicate schema table')
    tables.add(table.name.text)
    let value = table.initializer
    const indexes = []
    const names = new Set()
    while (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression)) {
      const kind = value.expression.name.text
      if (!['index', 'searchIndex', 'vectorIndex'].includes(kind) || value.arguments.length < 2 || value.arguments.length > 3 || !ts.isStringLiteral(value.arguments[0])) throw new Error(`Cannot establish index safety for ${table.name.text}`)
      if (names.has(value.arguments[0].text)) throw new Error('Duplicate schema index')
      names.add(value.arguments[0].text)
      const options = value.arguments.slice(1).map(literal)
      const fields = value => Array.isArray(value) && value.every(field => typeof field === 'string')
      const config = options[0]
      if (kind === 'index' ? !(fields(config) || config && fields(config.fields))
        : !config || typeof config !== 'object' || Array.isArray(config)
          || (kind === 'searchIndex' ? typeof config.searchField !== 'string' : typeof config.vectorField !== 'string' || !Number.isInteger(config.dimensions))
          || (config.filterFields !== undefined && !fields(config.filterFields))) throw new Error('Malformed index definition')
      indexes.push(`${kind}:${value.arguments[0].text}:${JSON.stringify(options)}`)
      value = value.expression.expression
    }
    if (!ts.isCallExpression(value) || !ts.isIdentifier(value.expression) || value.expression.text !== 'defineTable') throw new Error(`Cannot establish table safety for ${table.name.text}`)
    return [table.name.text, indexes.sort()]
  }))
}

export function requireIndexConfirmation(source, previousSource, confirmation) {
  if (![undefined, '', 'false', 'true'].includes(confirmation)) throw new Error('Invalid large-index confirmation')
  const previous = schemaIndexes(previousSource)
  const target = schemaIndexes(source)
  const changed = Object.entries(target).filter(([table, indexes]) =>
    Object.hasOwn(previous, table) && indexes.some(index => !previous[table].includes(index)),
  ).map(([table]) => table)
  if (changed.length && confirmation !== 'true') throw new Error(`Index additions or changes on existing tables (${changed.join(', ')}) require the current-main confirm_large_indexes input before Convex deploy`)
  return changed
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = process.env.BETTERMAN_DEPLOY_SHA
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error('A full deployment SHA is required')
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  // Main is squash-merge only; neither a target policy nor a target baseline can approve it.
  const previous = git('rev-parse', '--verify', `${sha}^`)
  const source = git('show', `${sha}:convex/schema.ts`)
  const previousSource = git('show', `${previous}:convex/schema.ts`)
  const changed = requireIndexConfirmation(source, previousSource, process.env.BETTERMAN_CONFIRM_LARGE_INDEXES)
  console.log(`Schema comparison ${previous} -> ${sha}: ${changed.length ? `explicitly confirmed index changes: ${changed.join(', ')}` : 'no index confirmation required'}`)
}
