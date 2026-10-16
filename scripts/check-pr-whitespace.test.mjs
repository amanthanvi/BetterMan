import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./check-pr-whitespace.sh', import.meta.url))
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'whitespace-test',
  GIT_AUTHOR_EMAIL: 'whitespace-test@example.com',
  GIT_COMMITTER_NAME: 'whitespace-test',
  GIT_COMMITTER_EMAIL: 'whitespace-test@example.com',
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' }).trim()
}

function repo() {
  const cwd = mkdtempSync(join(tmpdir(), 'bm-whitespace-'))
  git(cwd, ['init', '-b', 'main'])
  writeFileSync(join(cwd, 'clean.txt'), 'clean\n')
  git(cwd, ['add', 'clean.txt'])
  git(cwd, ['commit', '-m', 'base'])
  return cwd
}

function run(cwd, base, head) {
  try {
    const stdout = execFileSync('bash', [script, base, head], { cwd, env: gitEnv, encoding: 'utf8' })
    return { status: 0, stdout, stderr: '' }
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
    }
  }
}

test('fails on trailing whitespace introduced by the pull request', () => {
  const cwd = repo()
  const base = git(cwd, ['rev-parse', 'HEAD'])
  writeFileSync(join(cwd, 'clean.txt'), 'clean \n')
  git(cwd, ['add', 'clean.txt'])
  git(cwd, ['commit', '-m', 'trailing space'])
  const head = git(cwd, ['rev-parse', 'HEAD'])
  const result = run(cwd, base, head)
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /trailing whitespace/)
})

test('ignores whitespace that is not in the pull request diff', () => {
  const cwd = repo()
  const base = git(cwd, ['rev-parse', 'HEAD'])
  writeFileSync(join(cwd, 'other.txt'), 'dirty \n')
  git(cwd, ['add', 'other.txt'])
  git(cwd, ['commit', '-m', 'dirty on the other branch'])
  git(cwd, ['checkout', '-q', '-b', 'pr', base])
  writeFileSync(join(cwd, 'clean.txt'), 'cleanly changed\n')
  git(cwd, ['add', 'clean.txt'])
  git(cwd, ['commit', '-m', 'clean change'])
  const head = git(cwd, ['rev-parse', 'HEAD'])
  const dirty = git(cwd, ['rev-parse', 'main'])
  assert.equal(run(cwd, base, head).status, 0)
  assert.notEqual(run(cwd, base, dirty).status, 0)
})

test('fails on a conflict marker', () => {
  const cwd = repo()
  const base = git(cwd, ['rev-parse', 'HEAD'])
  writeFileSync(join(cwd, 'clean.txt'), '<<<<<<< ours\nclean\n')
  git(cwd, ['add', 'clean.txt'])
  git(cwd, ['commit', '-m', 'conflict marker'])
  const result = run(cwd, base, 'HEAD')
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /conflict marker|leftover conflict/)
})
