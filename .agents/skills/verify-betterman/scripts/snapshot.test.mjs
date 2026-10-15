import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../../../..')
const nextEnvRel = 'nextjs/next-env.d.ts'
const nextEnv = path.join(repoRoot, nextEnvRel)
const generatedPaths = [nextEnvRel, 'nextjs/AGENTS.md', 'nextjs/CLAUDE.md']

function tcpOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const finish = (open) => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(400)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function gitStatus(paths) {
  const args = ['status', '--short', '--untracked-files=all']
  if (paths) args.push('--', ...paths)
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

test('refused launch then cleanup leaves git status clean', { timeout: 60_000 }, async (t) => {
  assert.equal(await tcpOpen(3000), false, 'port 3000 is already in use')
  const stateDir = mkdtempSync(path.join(tmpdir(), 'bm-snapshot-'))
  const original = readFileSync(nextEnv)
  const generatedBefore = gitStatus(generatedPaths)
  const serverFile = path.join(stateDir, 'foreign.mjs')
  writeFileSync(
    serverFile,
    `import http from 'node:http'
const server = http.createServer((req, res) => {
  const url = req.url || '/'
  if (url.startsWith('/api/v1/info')) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end('{"error":"missing"}')
    return
  }
  if (url.startsWith('/api/v1/search')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"results":[]}')
    return
  }
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end('<html><body>BetterMan</body></html>')
})
server.listen(3000, '127.0.0.1')
`,
  )
  const server = spawn(process.execPath, [serverFile, `--config=${repoRoot}/nextjs`], { cwd: '/tmp', stdio: 'ignore' })
  let stopped = false
  const stopServer = () => {
    if (stopped || !server.pid) return
    stopped = true
    try {
      process.kill(server.pid, 'SIGTERM')
    } catch {
      stopped = true
    }
  }
  t.after(() => {
    stopServer()
    const current = existsSync(nextEnv) ? readFileSync(nextEnv) : Buffer.alloc(0)
    if (!current.equals(original)) writeFileSync(nextEnv, original)
    rmSync(stateDir, { recursive: true, force: true })
  })

  const listening = Date.now() + 5_000
  while (!(await tcpOpen(3000))) {
    if (Date.now() > listening) throw new Error('foreign server did not listen on 127.0.0.1:3000')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  const staleBytes = Buffer.from('/* stale uncommitted next-env */\n')
  const stale = {
    [nextEnvRel]: {
      kind: 'file',
      mode: 0o644,
      mtimeMs: Date.now() - 60_000,
      data: staleBytes.toString('base64'),
    },
    'nextjs/AGENTS.md': null,
    'nextjs/CLAUDE.md': null,
  }
  const snapshotFile = path.join(stateDir, 'generated-snapshot.json')
  writeFileSync(snapshotFile, `${JSON.stringify(stale)}\n`)

  const env = { ...process.env, VERIFY_STATE_DIR: stateDir, VERIFY_SKIP_BROWSER_INSTALL: '1' }
  delete env.VERIFY_EVIDENCE_DIR
  const launch = spawnSync(process.execPath, [path.join(scriptDir, 'launch.mjs')], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(launch.status, 2, `${launch.stdout}\n${launch.stderr}`)
  assert.match(launch.stderr, /Refusing to seed/)
  assert.equal(readFileSync(nextEnv).equals(original), true)
  assert.equal(existsSync(snapshotFile), true)

  const cleanup = spawnSync(process.execPath, [path.join(scriptDir, 'cleanup.mjs')], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(cleanup.status, 0, `${cleanup.stdout}\n${cleanup.stderr}`)
  assert.match(cleanup.stderr, /changed since the recorded snapshot/)
  assert.match(cleanup.stderr, /backing it up/)
  assert.equal(readFileSync(nextEnv).equals(original), true)
  assert.equal(existsSync(snapshotFile), false)
  const backups = readdirSync(path.join(stateDir, 'generated-backup'))
  assert.ok(backups.some((name) => name.includes('nextjs__next-env.d.ts') && name.endsWith('.snapshot')))
  assert.equal(gitStatus(generatedPaths), generatedBefore)

  stopServer()
  const closed = Date.now() + 5_000
  while (await tcpOpen(3000)) {
    if (Date.now() > closed) throw new Error('foreign server stayed on 127.0.0.1:3000')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  process.env.VERIFY_STATE_DIR = stateDir
  delete process.env.VERIFY_EVIDENCE_DIR
  const runtime = await import('./runtime.mjs')
  runtime.snapshotGeneratedFiles()
  const owned = JSON.parse(readFileSync(snapshotFile, 'utf8'))
  assert.equal(owned.owned, true)
  writeFileSync(nextEnv, Buffer.concat([original, Buffer.from('\n/* verify-owned-rewrite */\n')]))
  const restored = runtime.restoreGeneratedFiles({ removeSnapshot: true })
  assert.equal(restored.restored, true)
  assert.deepEqual(restored.skipped, [])
  assert.equal(readFileSync(nextEnv).equals(original), true)
  assert.equal(gitStatus(generatedPaths), generatedBefore)

  runtime.writeState({ sessions: [], listeners: {} })
  assert.equal(statSync(path.join(stateDir, 'run.json')).mode & 0o777, 0o600)
  assert.equal(statSync(stateDir).mode & 0o777, 0o700)
  const { verifyIdFor } = require('./verify-paths.cjs')
  process.env.VERIFY_ID = 'ci'
  assert.throws(() => verifyIdFor(repoRoot), /3-32/)
  process.env.VERIFY_ID = 'cix'
  assert.equal(verifyIdFor(repoRoot), 'cix')
  delete process.env.VERIFY_ID
  const sibling = `${repoRoot}-other`
  assert.equal(runtime.belongsToRepo({ cwd: repoRoot, cmdline: '' }), true)
  assert.equal(runtime.belongsToRepo({ cwd: `${repoRoot}/nextjs`, cmdline: '' }), true)
  assert.equal(runtime.belongsToRepo({ cwd: sibling, cmdline: '' }), false)
  assert.equal(runtime.belongsToRepo({ cwd: `${repoRoot}-extra`, cmdline: '' }), false)
  assert.equal(runtime.belongsToRepo({ cwd: '', argv: ['node', `${repoRoot}/nextjs/server.js`] }), true)
  assert.equal(runtime.belongsToRepo({ cwd: '', argv: ['node', repoRoot] }), true)
  assert.equal(runtime.belongsToRepo({ cwd: '/tmp', argv: ['node', `${sibling}/nextjs/server.js`] }), false)
  assert.equal(runtime.belongsToRepo({ cwd: '/tmp', argv: ['node', `--config=${repoRoot}/nextjs/server.js`] }), false)
  assert.equal(runtime.belongsToRepo({ cwd: '/tmp', cmdline: `node ${sibling}/nextjs/server.js` }), false)
  assert.equal(runtime.belongsToRepo({ cwd: `${repoRoot}/nextjs/..`, cmdline: '' }), true)
  assert.equal(runtime.belongsToRepo({ cwd: `${repoRoot}/nextjs/../../${path.basename(repoRoot)}-other`, cmdline: '' }), false)
  assert.equal(runtime.belongsToRepo({ cwd: '/tmp', argv: ['node'] }), false)
  assert.equal(runtime.baseUrlParts('http://[::1]:3000').loopback, true)
  assert.equal(runtime.baseUrlParts('http://[::1]:3000').port, 3000)
  assert.equal(runtime.baseUrlParts('http://127.0.0.1:3000').loopback, true)
  assert.equal(runtime.baseUrlParts('http://localhost:3000').loopback, true)
  assert.equal(runtime.baseUrlParts('http://172.30.0.2:9').loopback, false)
  const childEnv = runtime.buildLocalConvexEnv(
    {
      PATH: '/usr/bin',
      HOME: '/home/me',
      BETTERMAN_DATASET_STAGE: 'staging',
      CONVEX_DEPLOY_KEY: 'secret',
      CONVEX_URL: 'https://cloud.example',
    },
    { deployment: 'anonymous:anonymous-agent', backendUrl: 'http://127.0.0.1:3210', siteUrl: 'http://127.0.0.1:3211' },
  )
  assert.equal(childEnv.BETTERMAN_DATASET_STAGE, undefined)
  assert.equal(childEnv.CONVEX_DEPLOY_KEY, undefined)
  assert.equal(childEnv.CONVEX_URL, 'http://127.0.0.1:3210')
  assert.equal(childEnv.CONVEX_AGENT_MODE, 'anonymous')
  assert.equal(childEnv.PATH, '/usr/bin')
})

test('launch refuses an ipv6 loopback base url before starting servers', () => {
  const id = 'v6ref'
  const dir = mkdtempSync(path.join(tmpdir(), 'bm-ipv6-'))
  const result = spawnSync(process.execPath, [path.join(scriptDir, 'launch.mjs'), '--base-url', 'http://[::1]:3000'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      VERIFY_ID: id,
      VERIFY_STATE_DIR: dir,
      VERIFY_SKIP_BROWSER_INSTALL: '1',
    },
    encoding: 'utf8',
    timeout: 15_000,
  })
  try {
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stderr, /Use http:\/\/127\.0\.0\.1:3000/)
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /starting Convex|starting Next/)
    assert.deepEqual(readdirSync(dir), [])
    const tmuxArgs = existsSync('/exec-daemon/tmux.portal.conf') ? ['-f', '/exec-daemon/tmux.portal.conf'] : []
    for (const name of [`bmv-${id}-convex`, `bmv-${id}-next`]) {
      const session = spawnSync('tmux', [...tmuxArgs, 'has-session', '-t', name], { encoding: 'utf8' })
      assert.notEqual(session.status, 0, `${name} was started`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('refused launch keeps a live session snapshot', () => {
  const id = 'snalive'
  const dir = mkdtempSync(path.join(tmpdir(), 'bm-live-snapshot-'))
  const snapshotFile = path.join(dir, 'generated-snapshot.json')
  const body = `${JSON.stringify({ owned: true, writtenAt: '2026-01-01T00:00:00.000Z', entries: {} })}\n`
  writeFileSync(snapshotFile, body)
  writeFileSync(path.join(dir, 'run.json'), `${JSON.stringify({ sessions: [`bmv-${id}-next`], listeners: {} })}\n`)
  const tmuxArgs = existsSync('/exec-daemon/tmux.portal.conf') ? ['-f', '/exec-daemon/tmux.portal.conf'] : []
  const name = `bmv-${id}-next`
  const created = spawnSync('tmux', [...tmuxArgs, 'new-session', '-d', '-s', name, 'sleep', '30'], { encoding: 'utf8' })
  assert.equal(created.status, 0, created.stderr)
  try {
    const launch = spawnSync(process.execPath, [path.join(scriptDir, 'launch.mjs'), '--base-url', 'http://[::1]:3000'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        VERIFY_ID: id,
        VERIFY_STATE_DIR: dir,
        VERIFY_SKIP_BROWSER_INSTALL: '1',
      },
      encoding: 'utf8',
      timeout: 15_000,
    })
    assert.equal(launch.status, 2, `${launch.stdout}\n${launch.stderr}`)
    assert.equal(readFileSync(snapshotFile, 'utf8'), body)
  } finally {
    spawnSync('tmux', [...tmuxArgs, 'kill-session', '-t', name], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
  }
})

test('smoke reports a foreign state directory without a stack trace', (t) => {
  const foreign = '/usr'
  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  if (uid === null || statSync(foreign).uid === uid) {
    t.skip('skipping foreign state directory check: /usr is owned by the current user')
    return
  }
  const result = spawnSync(process.execPath, [path.join(scriptDir, 'smoke.mjs')], {
    cwd: repoRoot,
    env: { ...process.env, VERIFY_STATE_DIR: foreign, VERIFY_EVIDENCE_DIR: foreign },
    encoding: 'utf8',
    timeout: 15_000,
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^smoke: refusing \/usr: owned by uid /m)
  assert.doesNotMatch(result.stderr, /\n\s+at /)
})
