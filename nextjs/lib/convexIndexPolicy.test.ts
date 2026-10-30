import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'vitest'
import { requireIndexConfirmation, schemaIndexes } from '../../scripts/check-convex-indexes.mjs'

const table = 'defineTable({ value: v.string() }).index("by_releaseId", ["releaseId"])'
const source = (value: string) => `export default defineSchema({ licenses: ${value} });`
const baseline = { schemaVersion: 1, tables: schemaIndexes(source(table)) }

test('index additions and changes fail closed without an exact confirmation', () => {
  for (const change of [
    `${table}.index("by_storageId", ["storageId"])`,
    `${table}.index("by_storageId", ["storageId"], { staged: true })`,
    `${table}.searchIndex("search", { searchField: "value" })`,
    table.replace('["releaseId"]', '["storageId"]'),
    'defineTable({ value: v.string() })',
  ]) {
    for (const confirm of [undefined, '', 'false']) assert.throws(() => requireIndexConfirmation(source(change), baseline, confirm), /confirm_large_indexes/)
    assert.deepEqual(requireIndexConfirmation(source(change), baseline, 'true'), ['licenses'])
  }
  assert.throws(() => requireIndexConfirmation(source(table), baseline, 'TRUE'), /Invalid/)
})

test('missing tables, policy and uninspectable schemas cannot silently pass', () => {
  assert.throws(() => requireIndexConfirmation('export default defineSchema({});', baseline, 'false'), /confirm_large_indexes/)
  for (const code of ['export default generatedSchema;', 'export default defineSchema({ ...tables });', source(`${table}.index(indexName, fields)`), source(`${table}.unknown("index")`), source(`${table}.index("computed", fields)`)]) {
    for (const confirm of ['false', 'true']) assert.throws(() => requireIndexConfirmation(code, baseline, confirm))
  }
  assert.throws(() => requireIndexConfirmation(source(table), { schemaVersion: 1, tables: {} }, 'false'), /policy/)
})

test('ordinary fields and new empty tables do not backfill a listed legacy table', () => {
  const code = source(table.replace('value: v.string()', 'value: v.string(), storageId: v.optional(v.id("_storage"))')).replace(' });', ', fresh: defineTable({}).index("by_storageId", ["storageId"]) });')
  assert.deepEqual(requireIndexConfirmation(code, baseline, 'false'), [])
})

test('B2 avoids a new index on the existing licenses table', () => {
  const schema = readFileSync(new URL('../../convex/schema.ts', import.meta.url), 'utf8')
  const policy = JSON.parse(readFileSync(new URL('../../scripts/convex-index-policy.json', import.meta.url), 'utf8'))
  assert.ok(policy.tables.licenses.length > 0)
  assert.ok(!schemaIndexes(schema).licenses.some(index => index.includes('by_storageId')))
})
