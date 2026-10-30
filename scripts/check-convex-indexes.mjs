import { readFileSync } from 'node:fs'
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
  return Object.fromEntries(schema.arguments[0].properties.map(table => {
    if (!ts.isPropertyAssignment(table) || !ts.isIdentifier(table.name) && !ts.isStringLiteral(table.name)) throw new Error('Schema tables must be literal properties')
    let value = table.initializer
    const indexes = []
    while (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression)) {
      const kind = value.expression.name.text
      if (!['index', 'searchIndex', 'vectorIndex'].includes(kind) || !value.arguments[0] || !ts.isStringLiteral(value.arguments[0])) throw new Error(`Cannot establish index safety for ${table.name.text}`)
      indexes.push(`${kind}:${value.arguments[0].text}:${JSON.stringify(value.arguments.slice(1).map(literal))}`)
      value = value.expression.expression
    }
    if (!ts.isCallExpression(value) || !ts.isIdentifier(value.expression) || value.expression.text !== 'defineTable') throw new Error(`Cannot establish table safety for ${table.name.text}`)
    return [table.name.text, indexes.sort()]
  }))
}

export function requireIndexConfirmation(source, policy, confirmation) {
  if (![undefined, '', 'false', 'true'].includes(confirmation)) throw new Error('Invalid large-index confirmation')
  if (policy.schemaVersion !== 1 || !policy.tables || !Object.keys(policy.tables).length) throw new Error('Missing large-table index policy')
  const target = schemaIndexes(source)
  const changed = []
  for (const [table, approved] of Object.entries(policy.tables)) {
    if (!Array.isArray(approved) || approved.some(index => typeof index !== 'string')) throw new Error('Invalid large-table index policy')
    if (!target[table] || JSON.stringify([...approved].sort()) !== JSON.stringify(target[table])) changed.push(table)
  }
  if (changed.length && confirmation !== 'true') throw new Error(`Index changes on listed large tables (${changed.join(', ')}) require the current-main confirm_large_indexes input before Convex deploy`)
  return changed
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = readFileSync(new URL('../convex/schema.ts', import.meta.url), 'utf8')
  const policy = JSON.parse(readFileSync(new URL('./convex-index-policy.json', import.meta.url), 'utf8'))
  const changed = requireIndexConfirmation(source, policy, process.env.BETTERMAN_CONFIRM_LARGE_INDEXES)
  console.log(changed.length ? `Explicitly confirmed index changes: ${changed.join(', ')}` : 'No unconfirmed large-table index changes.')
}
