import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { matchesGlob } from 'node:path'
import { test } from 'node:test'
import { checkOsvExceptions } from './check-osv-exceptions.mjs'

const now = Date.parse('2026-10-18T00:00:00Z')
const ids = ['GHSA-fm4j-4xhm-xpwx', 'GHSA-gc25-3vc5-2jf9']
const entries = (change = () => {}) => ids.map((id) => {
  const entry = { id, ignoreUntil: '2027-08-03', reason: `Vercel's vercel/sandbox package. See https://github.com/advisories/${id}.` }
  change(entry)
  return entry
})
// Mirrors `pnpm list sandbox --recursive --depth Infinity --lockfile-only --json`.
function projects({ vercel = '58.4.4', sandbox = { from: 'sandbox', version: '3.4.0' }, change = () => {} } = {}) {
  const tree = [
    { name: 'betterman', devDependencies: { vercel: { from: 'vercel', version: vercel, dependencies: sandbox ? { sandbox } : {} } } },
    { name: 'betterman-nextjs' },
  ]
  change(tree)
  return tree
}

test('accepts post-1.0.0 sandbox releases through the Vercel CLI whatever the CLI version', () => {
  assert.deepEqual(checkOsvExceptions(entries(), projects(), 'betterman', now), ['3.4.0'])
  assert.deepEqual(checkOsvExceptions(entries(), projects({ vercel: '62.2.0', sandbox: { from: 'sandbox', version: '4.4.0' } }), 'betterman', now), ['4.4.0'])
  const nested = projects({ sandbox: null, change: (tree) => {
    tree[0].devDependencies.vercel.dependencies['@vercel/cli-exec'] = { from: '@vercel/cli-exec', version: '1.0.0', dependencies: { sandbox: { from: 'sandbox', version: '5.0.0' } } }
  } })
  assert.deepEqual(checkOsvExceptions(entries(), nested, 'betterman', now), ['5.0.0'])
})

test('rejects sandbox releases inside or not provably outside the advisory range', () => {
  for (const version of ['0.8.6', '1.0.0-beta.1', 'npm:other@4.4.0', undefined]) {
    assert.throws(() => checkOsvExceptions(entries(), projects({ sandbox: { from: 'sandbox', version } }), 'betterman', now), /not a stable release outside/)
  }
})

test('rejects sandbox outside the root Vercel CLI dependency and exceptions with no sandbox left', () => {
  for (const change of [
    (tree) => { tree[1].dependencies = { sandbox: { from: 'sandbox', version: '4.4.0' } } },
    (tree) => { tree[0].dependencies = { sandbox: { from: 'sandbox', version: '4.4.0' } } },
    (tree) => { tree[0].devDependencies.other = { from: 'other', version: '1.0.0', dependencies: { sandbox: { from: 'sandbox', version: '4.4.0' } } } },
  ]) assert.throws(() => checkOsvExceptions(entries(), projects({ change }), 'betterman', now), /reachable outside the root Vercel CLI/)
  assert.throws(() => checkOsvExceptions(entries(), projects({ sandbox: null }), 'betterman', now), /remove the stale OSV exceptions/)
  assert.throws(() => checkOsvExceptions(entries(), projects(), 'other-root', now), /expected root project/)
})

test('keeps the exception set narrow and evidenced', () => {
  assert.throws(() => checkOsvExceptions(entries().slice(1), projects(), 'betterman', now), /Expected exactly 2/)
  assert.throws(() => checkOsvExceptions(entries((entry) => { entry.id = ids[0] }), projects(), 'betterman', now), /Duplicate OSV exception/)
  assert.throws(() => checkOsvExceptions(entries((entry) => { if (entry.id === ids[0]) entry.id = 'GHSA-xxxx-xxxx-xxxx' }), projects(), 'betterman', now), /Unexpected OSV exception/)
  for (const reason of ['See https://github.com/advisories/GHSA-fm4j-4xhm-xpwx.', "Vercel's vercel/sandbox package."]) {
    assert.throws(() => checkOsvExceptions(entries((entry) => { entry.reason = reason }), projects(), 'betterman', now), /package identity and advisory evidence/)
  }
})

test('requires every exception to expire between 30 days and one year out', () => {
  for (const [ignoreUntil, message] of [
    ['2026-11-17', /expires within 30 days/],
    ['2027-10-20', /more than a year out/],
    ['soon', /Invalid ignoreUntil/],
  ]) assert.throws(() => checkOsvExceptions(entries((entry) => { entry.ignoreUntil = ignoreUntil }), projects(), 'betterman', now), message)
  assert.doesNotThrow(() => checkOsvExceptions(entries((entry) => { entry.ignoreUntil = '2027-10-19' }), projects(), 'betterman', now))
})

test('CI runs the OSV exception contract and ops:test covers these tests', () => {
  assert.ok(matchesGlob('scripts/check-osv-exceptions.test.mjs', JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts['ops:test'].split(' ').at(-1)))
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  assert.match(ci, /^ {6}- name: Check bounded OSV exceptions\n {8}run: node scripts\/check-osv-exceptions\.mjs$/m)
})
