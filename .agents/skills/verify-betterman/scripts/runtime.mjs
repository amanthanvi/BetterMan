import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

export const repoRoot = path.resolve(scriptDir, '../../../..')
export const skillDir = path.resolve(scriptDir, '..')
export const stateDir = process.env.VERIFY_STATE_DIR || '/tmp/betterman-verify'
export const evidenceDir = process.env.VERIFY_EVIDENCE_DIR || path.join(stateDir, 'evidence')
export const stateFile = path.join(stateDir, 'run.json')
export const defaultBaseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'

export const sessions = {
  convex: 'betterman-verify-convex',
  next: 'betterman-verify-next',
}

export function ensureDirs() {
  mkdirSync(stateDir, { recursive: true })
  mkdirSync(evidenceDir, { recursive: true })
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

function portDetails(port) {
  try {
    const fromSs = execFileSync('ss', ['-ltnp', `sport = :${port}`], { encoding: 'utf8' }).trim()
    if (fromSs) return fromSs
  } catch {
    // ss is optional. /proc is the fallback.
  }

  const inodes = listenInodes(port)
  if (!inodes.size) return ''
  const rows = []
  for (const dirent of readdirSync('/proc')) {
    if (!/^\d+$/.test(dirent)) continue
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
      let cmd = ''
      try {
        cmd = readFileSync(`/proc/${dirent}/cmdline`, 'utf8').replaceAll('\0', ' ').trim()
      } catch {
        cmd = ''
      }
      rows.push(`pid ${dirent} ${cmd}`)
    }
  }
  return rows.join('\n')
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
  }

  if (hasSearch && tar) {
    if (infoEmpty) lines.push('doctor: info cache is empty while search returns tar(1)')
    lines.push('doctor: READY')
    return { ok: true, code: 'ready', lines, info, homeStatus: home.status }
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
  writeFileSync(scriptPath, scriptBody, { mode: 0o755 })
  const logPath = path.join(stateDir, `${name}.log`)
  const wrapped = `#!/usr/bin/env bash
set -euo pipefail
cd ${shellQuote(repoRoot)}
exec bash ${shellQuote(scriptPath)} > ${shellQuote(logPath)} 2>&1
`
  const wrappedPath = path.join(stateDir, `${name}.wrap.sh`)
  writeFileSync(wrappedPath, wrapped, { mode: 0o755 })
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
