const { createHash } = require('node:crypto')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../../../..')

function verifyIdFor(root = repoRoot) {
  const override = process.env.VERIFY_ID
  if (override) {
    if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(override)) {
      throw new Error('VERIFY_ID must be 2-32 characters of lowercase letters, digits, or hyphens')
    }
    return override
  }
  return createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 8)
}

function evidenceDirFor() {
  if (process.env.VERIFY_EVIDENCE_DIR) return process.env.VERIFY_EVIDENCE_DIR
  const id = verifyIdFor(repoRoot)
  const state = process.env.VERIFY_STATE_DIR || `/tmp/betterman-verify-${id}`
  return path.join(state, 'evidence')
}

module.exports = { evidenceDirFor, repoRoot, verifyIdFor }
