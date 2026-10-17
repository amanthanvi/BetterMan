import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkProof } from './check-proof-sha.mjs'

const sha = '0123456789abcdef0123456789abcdef01234567'
const other = 'fedcba9876543210fedcba9876543210fedcba98'

test('requires a Proof heading that cites the full head SHA', () => {
  assert.equal(checkProof({ body: `## Proof\n\n${sha}\n`, sha, author: 'amanthanvi' }).ok, true)
  assert.equal(checkProof({ body: `### proof\r\n\r\nseen \`${sha.toUpperCase()}\`\r\n`, sha, author: 'amanthanvi' }).ok, true)
  assert.match(checkProof({ body: 'no proof here', sha, author: 'amanthanvi' }).message, /missing/i)
  assert.match(checkProof({ body: `## Proof\n\n${other}\n`, sha, author: 'amanthanvi' }).message, /does not cite/)
  assert.match(checkProof({ body: `${sha}\n\n## Notes\n`, sha, author: 'amanthanvi' }).message, /missing/i)
  assert.match(checkProof({ body: `## Proof\n\n${sha.slice(0, 7)}\n`, sha, author: 'amanthanvi' }).message, /does not cite/)
  assert.match(checkProof({ body: `## Proof\n\n${sha}aa\n`, sha, author: 'amanthanvi' }).message, /does not cite/)
})

test('keeps a nested heading inside the Proof section and ignores a later section', () => {
  const body = `## Proof\n\n### Commands\n\n${sha}\n\n## Notes\n\n${other}\n`
  assert.equal(checkProof({ body, sha, author: 'amanthanvi' }).ok, true)
  const outside = `## Proof\n\nstale ${other}\n\n## Notes\n\n${sha}\n`
  assert.match(checkProof({ body: outside, sha, author: 'amanthanvi' }).message, /does not cite/)
})

test('keeps a fenced shell comment and a SHA on a nested heading', () => {
  const fenced = '## Proof\n\n```bash\n# results\n```\n\n' + sha + '\n'
  assert.equal(checkProof({ body: fenced, sha, author: 'amanthanvi' }).ok, true)
  const nested = `## Proof\n\n### Tested ${sha}\n`
  assert.equal(checkProof({ body: nested, sha, author: 'amanthanvi' }).ok, true)
  const comment = `## Proof\n\n# results\n\n${sha}\n`
  assert.match(checkProof({ body: comment, sha, author: 'amanthanvi' }).message, /does not cite/)
})

test('does not hide Proof behind a one-line code span', () => {
  const body = 'See ```pnpm test```.\n\n## Proof\n\n' + sha + '\n'
  assert.equal(checkProof({ body, sha, author: 'amanthanvi' }).ok, true)
})

test('allows up to three leading spaces before the Proof heading', () => {
  assert.equal(checkProof({ body: `   ## Proof\n\n${sha}\n`, sha, author: 'amanthanvi' }).ok, true)
  assert.match(checkProof({ body: `    ## Proof\n\n${sha}\n`, sha, author: 'amanthanvi' }).message, /missing/i)
})

test('does not treat a longer heading as the Proof section', () => {
  const body = `## Proof of work\n\n${sha}\n`
  assert.match(checkProof({ body, sha, author: 'amanthanvi' }).message, /missing/i)
})

test('skips dependabot even when the body has no Proof section', () => {
  const result = checkProof({ body: '', sha, author: 'dependabot[bot]' })
  assert.equal(result.ok, true)
  assert.match(result.message, /dependabot\[bot\]/)
  assert.match(checkProof({ body: '', sha, author: 'Dependabot[bot]' }).message, /missing/i)
})

test('rejects a head value that is not a full digest', () => {
  assert.match(checkProof({ body: `## Proof\n\n${sha.slice(0, 7)}`, sha: sha.slice(0, 7), author: 'amanthanvi' }).message, /40-character/)
})
