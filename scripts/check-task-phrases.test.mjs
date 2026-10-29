import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkTaskPhraseStatus } from './check-task-phrases.mjs'

const release = (state, extra = {}) => ({ stage: 'prod', distro: 'debian', datasetReleaseId: 'debian-1', state, scanned: 10, written: 3, attempts: 1, updatedAt: 1, ...extra })

test('passes only when every active release is complete', () => {
  const ok = checkTaskPhraseStatus({ complete: true, version: 1, releases: [release('complete'), release('complete', { stage: 'staging' })] })
  assert.equal(ok.releases.length, 2)
  assert.throws(() => checkTaskPhraseStatus({ complete: false, version: 1, releases: [release('running')] }), /not complete/)
  assert.throws(() => checkTaskPhraseStatus({ complete: false, version: 1, releases: [release('missing')] }), /not complete/)
})

test('names a failed release and how to resume it', () => {
  assert.throws(() => checkTaskPhraseStatus({ complete: false, version: 1, releases: [release('failed')] }),
    /TASK_PHRASE_BACKFILL_FAILED for prod\/debian \(debian-1\): rerun taskPhrases:backfillActiveReleases/)
})

test('rejects malformed responses and prints only allowlisted fields', () => {
  assert.throws(() => checkTaskPhraseStatus(null), /Invalid/)
  assert.throws(() => checkTaskPhraseStatus({ complete: true, version: 1, releases: [{ state: 'odd', datasetReleaseId: 'x' }] }), /Invalid/)
  const out = checkTaskPhraseStatus({ complete: true, version: 1, releases: [release('complete', { secret: 'nope' })] })
  assert.equal('secret' in out.releases[0], false)
})
