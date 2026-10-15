import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

export const repoRoot = path.resolve(scriptDir, '../../../..')
export const skillDir = path.resolve(scriptDir, '..')

function resolveVerifyId() {
  const override = process.env.VERIFY_ID
  if (override) {
    if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(override)) {
      throw new Error('VERIFY_ID must be 3-32 characters of lowercase letters, digits, or hyphens')
    }
    return override
  }
  return createHash('sha256').update(repoRoot).digest('hex').slice(0, 8)
}

export const verifyId = resolveVerifyId()
export const stateDir = process.env.VERIFY_STATE_DIR || `/tmp/betterman-verify-${verifyId}`
export const evidenceDir = process.env.VERIFY_EVIDENCE_DIR || path.join(stateDir, 'evidence')
export const stateFile = path.join(stateDir, 'run.json')
export const defaultBaseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'

export const sessions = {
  convex: `bmv-${verifyId}-convex`,
  next: `bmv-${verifyId}-next`,
}

export const convexRemoteKeys = [
  'CONVEX_DEPLOY_KEY',
  'CONVEX_DEPLOYMENT',
  'CONVEX_URL',
  'CONVEX_SITE_URL',
  'CONVEX_HTTP_URL',
  'CONVEX_SELF_HOSTED_URL',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
  'CONVEX_OVERRIDE_URL',
  'CONVEX_OVERRIDE_ACCESS_TOKEN',
]

export function scrubConvexEnv(base = process.env) {
  const env = { ...base }
  for (const key of Object.keys(env)) {
    if (convexRemoteKeys.includes(key) || key.startsWith('CONVEX_DEPLOY')) delete env[key]
  }
  return env
}

export function clearNextFetchCache() {
  const dir = path.join(repoRoot, 'nextjs', '.next', 'dev', 'cache', 'fetch-cache')
  const resolved = path.resolve(dir)
  const nextRoot = path.resolve(repoRoot, 'nextjs')
  if (!resolved.startsWith(`${nextRoot}${path.sep}`)) return
  let current
  try {
    current = lstatSync(resolved)
  } catch {
    return
  }
  if (current.isSymbolicLink() || !current.isDirectory()) return
  rmSync(resolved, { recursive: true, force: true })
}

export function bashUnsetConvexRemote() {
  return `unset ${convexRemoteKeys.join(' ')}
while IFS= read -r _bm_convex_key; do
  case "\${_bm_convex_key}" in
    CONVEX_DEPLOY*) unset "\${_bm_convex_key}" ;;
  esac
done < <(compgen -e || true)`
}

export function isLoopbackUrl(value) {
  if (!value) return false
  try {
    const host = new URL(value).hostname
    return host === '127.0.0.1' || host === 'localhost' || host === '::1'
  } catch {
    return false
  }
}

export function assertLocalSeedTarget({ deployment, backendUrl, siteUrl, deployKey }) {
  if (deployKey) {
    throw new Error('refusing to seed while a Convex deploy key is configured')
  }
  const anonymous = !deployment || deployment.startsWith('anonymous:')
  const backendLocal = isLoopbackUrl(backendUrl)
  const siteLocal = !siteUrl || isLoopbackUrl(siteUrl)
  if (anonymous && backendLocal && siteLocal) return
  throw new Error(
    `refusing to seed a non-local Convex target (deployment=${deployment || 'unset'} backend=${backendUrl || 'unset'} site=${siteUrl || 'unset'})`,
  )
}

const generatedRelPaths = ['nextjs/next-env.d.ts', 'nextjs/AGENTS.md', 'nextjs/CLAUDE.md']

function snapshotPath() {
  return path.join(stateDir, 'generated-snapshot.json')
}

function pathExists(file) {
  try {
    lstatSync(file)
    return true
  } catch {
    return false
  }
}

function ensurePrivateDir(dir) {
  if (pathExists(dir)) {
    const existing = lstatSync(dir)
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      throw new Error(`refusing ${dir}: expected a real directory owned by the current user`)
    }
  } else {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }

  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  const current = lstatSync(dir)
  if (current.isSymbolicLink() || !current.isDirectory()) {
    throw new Error(`refusing ${dir}: expected a real directory owned by the current user`)
  }
  if (uid !== null && current.uid !== uid) {
    throw new Error(`refusing ${dir}: owned by uid ${current.uid}, expected ${uid}`)
  }
  chmodSync(dir, 0o700)
  const secured = lstatSync(dir)
  if (uid !== null && secured.uid !== uid) {
    throw new Error(`refusing ${dir}: owned by uid ${secured.uid}, expected ${uid}`)
  }
  if ((secured.mode & 0o077) !== 0) {
    throw new Error(`refusing ${dir}: mode is not 0700`)
  }
}

export function ensureDirs() {
  ensurePrivateDir(stateDir)
  if (path.resolve(evidenceDir) !== path.resolve(stateDir)) ensurePrivateDir(evidenceDir)
}

function writePrivateFile(filePath, body) {
  const tmp = `${filePath}.${process.pid}.tmp`
  writeFileSync(tmp, body, { mode: 0o700 })
  renameSync(tmp, filePath)
  chmodSync(filePath, 0o700)
}

export function snapshotGeneratedFiles() {
  ensureDirs()
  const file = snapshotPath()
  if (pathExists(file)) return
  const entries = {}
  for (const rel of generatedRelPaths) {
    const abs = path.join(repoRoot, rel)
    if (!pathExists(abs)) {
      entries[rel] = null
      continue
    }
    const stat = lstatSync(abs)
    if (stat.isSymbolicLink()) {
      entries[rel] = { kind: 'link', target: readlinkSync(abs) }
      continue
    }
    entries[rel] = {
      kind: 'file',
      mode: stat.mode & 0o777,
      data: readFileSync(abs).toString('base64'),
    }
  }
  writePrivateFile(file, `${JSON.stringify(entries)}\n`)
}

export function restoreGeneratedFiles({ removeSnapshot = false } = {}) {
  const file = snapshotPath()
  if (!pathExists(file)) return false
  const entries = JSON.parse(readFileSync(file, 'utf8'))
  for (const [rel, saved] of Object.entries(entries)) {
    const abs = path.join(repoRoot, rel)
    if (saved === null) {
      if (pathExists(abs)) unlinkSync(abs)
      continue
    }
    if (saved.kind === 'link') {
      if (pathExists(abs)) unlinkSync(abs)
      symlinkSync(saved.target, abs)
      continue
    }
    const data = Buffer.from(saved.data, 'base64')
    const current = pathExists(abs) && lstatSync(abs).isFile() ? readFileSync(abs) : null
    if (!current || !current.equals(data)) {
      const tmp = `${abs}.${process.pid}.verify-restore`
      writeFileSync(tmp, data, { mode: saved.mode || 0o644 })
      renameSync(tmp, abs)
    }
  }
  if (removeSnapshot) unlinkSync(file)
  return true
}

export function readState() {
  if (!existsSync(stateFile)) return null
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'))
  } catch {
    return null
  }
}

export function writeState(state) {
  ensureDirs()
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`)
}

export function loadEnvFile(file) {
  if (!existsSync(file)) return {}
  const env = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return env
}

export function baseUrlParts(baseUrl) {
  const url = new URL(baseUrl)
  return {
    url,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    loopback: url.hostname === '127.0.0.1' || url.hostname === 'localhost',
  }
}

export function tcpOpen(port, host = '127.0.0.1', timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const finish = (open) => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
    })
    const text = await response.text()
    return { status: response.status, text, error: '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const aborted = error instanceof Error && error.name === 'AbortError'
    return { status: 0, text: '', error: aborted ? 'timeout' : message }
  } finally {
    clearTimeout(timer)
  }
}

function listenFamilies(port) {
  const result = { known: false, v4: false, v6: false }
  const files = [
    ['/proc/net/tcp', 'v4'],
    ['/proc/net/tcp6', 'v6'],
  ]
  for (const [file, family] of files) {
    if (!existsSync(file)) continue
    result.known = true
    const lines = readFileSync(file, 'utf8').split('\n').slice(1)
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4) continue
      const portHex = parts[1].split(':')[1]
      if (!portHex || parts[3] !== '0A') continue
      if (Number.parseInt(portHex, 16) === port) result[family] = true
    }
  }
  return result
}

function listenInodes(port) {
  const inodes = new Set()
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    if (!existsSync(file)) continue
    const lines = readFileSync(file, 'utf8').split('\n').slice(1)
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 10) continue
      const local = parts[1]
      const state = parts[3]
      const inode = parts[9]
      const portHex = local.split(':')[1]
      if (!portHex || state !== '0A') continue
      if (Number.parseInt(portHex, 16) === port) inodes.add(inode)
    }
  }
  return inodes
}

export function processIdentity(pid) {
  const id = String(pid)
  const identity = { pid: Number(id), cwd: '', cmdline: '', startTicks: '' }
  try {
    identity.cwd = readlinkSync(`/proc/${id}/cwd`)
  } catch {
    identity.cwd = ''
  }
  try {
    identity.cmdline = readFileSync(`/proc/${id}/cmdline`, 'utf8').replaceAll('\0', ' ').trim()
  } catch {
    identity.cmdline = ''
  }
  try {
    const stat = readFileSync(`/proc/${id}/stat`, 'utf8')
    const afterComm = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)
    identity.startTicks = afterComm[19] || ''
  } catch {
    identity.startTicks = ''
  }
  return identity
}

export function belongsToRepo(identity) {
  const cwd = identity?.cwd || ''
  const cmdline = identity?.cmdline || ''
  const inTree = cwd === repoRoot || cwd.startsWith(`${repoRoot}${path.sep}`)
  return inTree || cmdline.includes(repoRoot)
}

export function sameProcess(recorded, live) {
  if (!recorded?.pid || !recorded.startTicks || !live?.startTicks) return false
  return (
    String(recorded.pid) === String(live.pid) &&
    String(recorded.startTicks) === String(live.startTicks) &&
    belongsToRepo(live)
  )
}

export function listenersOn(port) {
  const inodes = listenInodes(port)
  if (!inodes.size) return []
  const found = []
  const seen = new Set()
  for (const dirent of readdirSync('/proc')) {
    if (!/^\d+$/.test(dirent) || seen.has(dirent)) continue
    let fds = []
    try {
      fds = readdirSync(`/proc/${dirent}/fd`)
    } catch {
      continue
    }
    for (const fd of fds) {
      let target = ''
      try {
        target = readlinkSync(`/proc/${dirent}/fd/${fd}`)
      } catch {
        continue
      }
      if (!target.startsWith('socket:[') || !inodes.has(target.slice(8, -1))) continue
      seen.add(dirent)
      found.push(processIdentity(dirent))
      break
    }
  }
  return found
}

function portDetails(port) {
  const listeners = listenersOn(port)
  if (listeners.length) {
    return listeners.map((item) => `pid ${item.pid} ${item.cmdline} cwd=${item.cwd || 'unknown'} start=${item.startTicks || 'unknown'}`).join('\n')
  }
  try {
    return execFileSync('ss', ['-ltnp', `sport = :${port}`], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function hasTar(search) {
  return Array.isArray(search?.results) && search.results.some((row) => row && row.name === 'tar' && row.section === '1')
}

export async function checkHealth(baseUrl = defaultBaseUrl) {
  const lines = []
  const home = await fetchText(new URL('/', baseUrl).href, 8_000)
  const infoRes = await fetchText(new URL('/api/v1/info', baseUrl).href, 8_000)
  const searchRes = await fetchText(new URL('/api/v1/search?q=tar&limit=5', baseUrl).href, 8_000)
  const info = parseJson(infoRes.text)
  const search = parseJson(searchRes.text)
  const hasSearch = home.status === 200 && home.text.includes('Search man pages')
  const shell = home.text.includes('data-bm-app-header') || home.text.includes('>BetterMan<') || home.text.includes('BetterMan')
  const tar = searchRes.status === 200 && hasTar(search)
  const pageCount = typeof info?.pageCount === 'number' ? info.pageCount : null
  const infoEmpty = infoRes.status === 404 || pageCount === 0
  const releaseMissing = home.text.includes('Dataset release not found')

  if (home.status === 0 && infoRes.status === 0 && searchRes.status === 0) {
    lines.push(`doctor: home unreachable (${home.error || 'no response'})`)
    lines.push('doctor: NOT_READY unreachable')
    return { ok: false, code: 'unreachable', lines }
  }

  lines.push(`doctor: home ${home.status || 'down'}${hasSearch ? ' search-box-present' : ' search-box-missing'}`)
  if (infoRes.status === 200 && info) {
    lines.push(`doctor: info pageCount=${pageCount} release=${info.datasetReleaseId || 'unknown'} distro=${info.distro || 'unknown'}`)
  } else {
    lines.push(`doctor: info ${infoRes.status || 'down'}`)
  }
  lines.push(`doctor: search ${searchRes.status || 'down'}${tar ? ' tar(1)' : ' tar(1)-missing'}`)

  const { port, loopback } = baseUrlParts(baseUrl)
  if (loopback) {
    const owners = portDetails(port)
    lines.push(owners ? `doctor: port ${port}\n${owners}` : `doctor: port ${port} owner-unknown`)
    const families = listenFamilies(port)
    if (families.known) {
      lines.push(`doctor: bind v4=${families.v4 ? 'yes' : 'no'} v6=${families.v6 ? 'yes' : 'no'}`)
    }
    const v4Open = await tcpOpen(port, '127.0.0.1')
    lines.push(`doctor: probe 127.0.0.1:${port} ${v4Open ? 'open' : 'closed'}`)
    if (families.known && families.v6 && !families.v4) {
      lines.push('doctor: NOT_READY ipv6-only')
      return { ok: false, code: 'ipv6-only', lines, info, homeStatus: home.status }
    }
    if (!v4Open && (hasSearch || tar)) {
      lines.push('doctor: NOT_READY ipv4-unreachable')
      return { ok: false, code: 'ipv4-unreachable', lines, info, homeStatus: home.status }
    }
  }

  const infoReady = infoRes.status === 200 && pageCount !== null && pageCount > 0
  if (hasSearch && tar && infoReady) {
    lines.push('doctor: READY')
    return { ok: true, code: 'ready', lines, info, homeStatus: home.status }
  }

  if (hasSearch && tar && infoEmpty) {
    lines.push('doctor: NOT_READY info-stale')
    return { ok: false, code: 'info-stale', lines, info, homeStatus: home.status }
  }

  if (hasSearch && tar) {
    lines.push('doctor: NOT_READY info-unreadable')
    return { ok: false, code: 'info-unreadable', lines, info, homeStatus: home.status }
  }

  if (!tar && (infoEmpty || releaseMissing) && (shell || infoRes.status === 200 || infoRes.status === 404)) {
    lines.push('doctor: NOT_READY empty-dataset')
    return { ok: false, code: 'empty-dataset', lines, info, homeStatus: home.status }
  }

  if (!hasSearch) {
    lines.push('doctor: NOT_READY home-unhealthy')
    return { ok: false, code: 'home-unhealthy', lines, info, homeStatus: home.status }
  }

  if (infoRes.status !== 200 || pageCount === null) {
    lines.push('doctor: NOT_READY info-unreadable')
    return { ok: false, code: 'info-unreadable', lines, info, homeStatus: home.status }
  }

  lines.push('doctor: NOT_READY search-missing-tar')
  return { ok: false, code: 'search-missing-tar', lines, info, homeStatus: home.status }
}

export async function confirmHydration(baseUrl, report) {
  if (!report?.ok) return report
  const lines = report.lines.filter((line) => line !== 'doctor: READY')
  let browser
  try {
    const require = createRequire(path.join(repoRoot, 'nextjs/package.json'))
    const { chromium } = require('@playwright/test')
    browser = await chromium.launch({ headless: true, timeout: 30_000 })
    const page = await browser.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error instanceof Error ? error.message : String(error))
    })
    await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await page.waitForFunction(() => {
      const button = document.querySelector('button[aria-label="Cycle theme"]')
      if (!button) return false
      return Object.keys(button).some((key) => key.startsWith('__reactProps'))
    }, null, { timeout: 15_000 })
    await page.getByRole('button', { name: 'Cycle theme' }).click({ timeout: 5_000 })
    const theme = await page.evaluate(() => localStorage.getItem('bm-theme'))
    if (pageErrors.length) {
      lines.push(`doctor: hydration pageerror ${pageErrors[0]}`)
      lines.push('doctor: NOT_READY not-hydrated')
      return { ...report, ok: false, code: 'not-hydrated', lines }
    }
    if (theme !== 'light' && theme !== 'dark' && theme !== 'system') {
      lines.push('doctor: hydration bm-theme missing after Cycle theme click')
      lines.push('doctor: NOT_READY not-hydrated')
      return { ...report, ok: false, code: 'not-hydrated', lines }
    }
    lines.push(`doctor: hydration react-props bm-theme=${theme}`)
    lines.push('doctor: READY')
    return { ...report, ok: true, code: 'ready', lines }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const first = message.split('\n')[0]
    lines.push(`doctor: hydration failed (${first})`)
    const missing = first.includes('Cannot find module') || first.includes("Executable doesn't exist")
    const code = missing ? 'hydration-unproven' : 'not-hydrated'
    lines.push(`doctor: NOT_READY ${code}`)
    return { ...report, ok: false, code, lines }
  } finally {
    if (browser) await browser.close()
  }
}

export function tmuxCommand() {
  const conf = '/exec-daemon/tmux.portal.conf'
  return { bin: 'tmux', prefix: existsSync(conf) ? ['-f', conf] : [] }
}

export function tmuxAvailable() {
  const found = spawnSync('tmux', ['-V'], { encoding: 'utf8' })
  return found.status === 0
}

export function startTmuxSession(name, scriptBody) {
  const { bin, prefix } = tmuxCommand()
  const scriptPath = path.join(stateDir, `${name}.sh`)
  writePrivateFile(scriptPath, scriptBody)
  const logPath = path.join(stateDir, `${name}.log`)
  const wrapped = `#!/usr/bin/env bash
set -euo pipefail
cd ${shellQuote(repoRoot)}
exec bash ${shellQuote(scriptPath)} > ${shellQuote(logPath)} 2>&1
`
  const wrappedPath = path.join(stateDir, `${name}.wrap.sh`)
  writePrivateFile(wrappedPath, wrapped)
  const created = spawnSync(
    bin,
    [...prefix, 'new-session', '-d', '-s', name, '-c', repoRoot, '--', 'bash', wrappedPath],
    { encoding: 'utf8' },
  )
  if (created.status !== 0) {
    throw new Error(created.stderr || created.stdout || `tmux new-session ${name} failed`)
  }
  return { logPath }
}

export function killTmuxSession(name) {
  const { bin, prefix } = tmuxCommand()
  const result = spawnSync(bin, [...prefix, 'kill-session', '-t', name], { encoding: 'utf8' })
  return result.status === 0
}

export function sessionExists(name) {
  const { bin, prefix } = tmuxCommand()
  const result = spawnSync(bin, [...prefix, 'has-session', '-t', name], { encoding: 'utf8' })
  return result.status === 0
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`
}

export function nodePathExport() {
  const nvmNode = path.join(process.env.NVM_DIR || path.join(process.env.HOME || '', '.nvm'), 'versions/node/v26.5.1/bin')
  const localBin = path.join(process.env.HOME || '', '.local/bin')
  return `export PATH="${nvmNode}:${localBin}:$PATH"`
}

export function runCommand(command, args, { timeoutMs = 120_000, env = process.env, input } = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: timeoutMs,
    env,
    input,
  })
}
