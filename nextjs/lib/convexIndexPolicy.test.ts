import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'
import { requireIndexConfirmation, schemaIndexes } from '../../scripts/check-convex-indexes.mjs'

const table = 'defineTable({ value: v.string() }).index("by_releaseId", ["releaseId"])'
const source = (value: string) => `export default defineSchema({ licenses: ${value} });`
const baseline = source(table)

test('index additions and changes fail closed without an exact confirmation', () => {
  for (const change of [
    `${table}.index("by_storageId", ["storageId"])`,
    `${table}.index("by_storageId", ["storageId"], { staged: true })`,
    `${table}.searchIndex("search", { searchField: "value" })`,
    table.replace('["releaseId"]', '["storageId"]'),
  ]) {
    for (const confirm of [undefined, '', 'false']) assert.throws(() => requireIndexConfirmation(source(change), baseline, confirm), /confirm_large_indexes/)
    assert.deepEqual(requireIndexConfirmation(source(change), baseline, 'true'), ['licenses'])
  }
  assert.throws(() => requireIndexConfirmation(source(table), baseline, 'TRUE'), /Invalid/)
})

test('missing tables, policy and uninspectable schemas cannot silently pass', () => {
  assert.deepEqual(requireIndexConfirmation('export default defineSchema({});', baseline, 'false'), [])
  for (const code of ['export default generatedSchema;', 'export default defineSchema({ ...tables });', source(`${table}.index(indexName, fields)`), source(`${table}.unknown("index")`), source(`${table}.index("computed", fields)`), source(`${table}.index("bad")`), source(`${table}.index("bad", null)`), source(`${table}.searchIndex("bad", {})`), source(`${table}.vectorIndex("bad", { vectorField: "x" })`), source(`${table}.index("by_releaseId", ["x"])`)]) {
    for (const confirm of ['false', 'true']) assert.throws(() => requireIndexConfirmation(code, baseline, confirm))
  }
  assert.throws(() => requireIndexConfirmation(source(table), 'export default broken;', 'true'))
})

test('ordinary fields and new empty tables do not backfill a listed legacy table', () => {
  const code = source(table.replace('value: v.string()', 'value: v.string(), storageId: v.optional(v.id("_storage"))')).replace(' });', ', fresh: defineTable({}).index("by_storageId", ["storageId"]) });')
  assert.deepEqual(requireIndexConfirmation(code, baseline, 'false'), [])
})

test('B2 avoids a new index on the existing licenses table', () => {
  const schema = readFileSync(new URL('../../convex/schema.ts', import.meta.url), 'utf8')
  assert.ok(!schemaIndexes(schema).licenses.some(index => index.includes('by_storageId')))
})

test('every existing table is checked without any policy or editable approved baseline', () => {
  const previous = 'export default defineSchema({ formerlyUnlisted: defineTable({}) });'
  const target = 'export default defineSchema({ formerlyUnlisted: defineTable({}).index("new", ["x"]) });'
  assert.throws(() => requireIndexConfirmation(target, previous, 'false'), /formerlyUnlisted/)
  assert.deepEqual(requireIndexConfirmation(target, previous, 'true'), ['formerlyUnlisted'])
})

test('deployment CLI reads immutable parent/target schemas, ignoring target policy and baseline edits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-index-parent-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim()
  const commit = (schema: string) => {
    writeFileSync(join(dir, 'convex/schema.ts'), schema)
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'schema')
    return git('rev-parse', 'HEAD')
  }
  const run = (sha: string, confirm = 'false') => execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/check-convex-indexes.mjs', import.meta.url))], {
    cwd: dir, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, BETTERMAN_DEPLOY_SHA: sha, BETTERMAN_CONFIRM_LARGE_INDEXES: confirm },
  })
  try {
    git('init', '-q')
    mkdirSync(join(dir, 'convex'))
    commit(source(table))
    const fresh = commit(source(table).replace(' });', ', newTable: defineTable({}).index("new", ["x"]) });'))
    assert.match(run(fresh), /no index confirmation required/)
    // A target can delete or rewrite every former policy/baseline; Git's parent still governs.
    writeFileSync(join(dir, 'convex-index-policy.json'), '{"tables":{}}')
    writeFileSync(join(dir, 'baseline.ts'), source(`${table}.index("new", ["x"])`))
    const changed = commit(source(`${table}.index("new", ["x"])`))
    assert.throws(() => run(changed), /confirm_large_indexes/)
    assert.match(run(changed, 'true'), /explicitly confirmed index changes: licenses/)
    const malformed = commit('export default defineSchema({ ...tables })')
    assert.throws(() => run(malformed, 'true'), /literal/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
