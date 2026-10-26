import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { gzipSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { createServer as createViteServer } from 'vite'
import { convexToJson, jsonToConvex } from 'convex/values'
import { makeFunctionReference } from 'convex/server'
import { checkQueryShape, compareBudgets, installVitalObservers, median, recordSyscall } from './perf-metrics.mjs'

const root = resolve(import.meta.dirname, '..')
const require = createRequire(resolve(root, 'nextjs/package.json'))
const { chromium } = require('@playwright/test')
const nextBin = require.resolve('next/dist/bin/next')
const budgetPath = resolve(root, 'perf-budgets.json')
const output = resolve(root, '.perf-results')
const routes = { home: '/', man: '/man/bash/1', search: '/search?q=tar', section: '/section/1' }
assert.ok(process.argv.slice(2).every(arg => arg === '--record'), 'Usage: pnpm perf:check [--record]')
const record = process.argv.includes('--record')
const budget = JSON.parse(await readFile(budgetPath, 'utf8'))
assert.equal(budget.schemaVersion, 1, 'Unsupported budget schema')
assert.equal(Number(process.versions.node.split('.')[0]), 26, 'Use Node 26 for the budget harness')
const fixtureSha256 = createHash('sha256').update(await readFile(resolve(root, 'scripts/perf-fixture.ts'))).digest('hex')
const toolchain = {
  next: require('next/package.json').version,
  playwright: require('@playwright/test/package.json').version,
  convex: JSON.parse(await readFile(resolve(root, 'node_modules/convex/package.json'), 'utf8')).version,
  convexTest: JSON.parse(await readFile(resolve(root, 'node_modules/convex-test/package.json'), 'utf8')).version,
}
if (!record) {
  assert.equal(fixtureSha256, budget.fixtureSha256, 'Fixture changed; explicitly review and remeasure the baseline')
  assert.deepEqual(toolchain, budget.toolchain, 'Measurement toolchain changed; explicitly review and remeasure the baseline')
}
await mkdir(output, { recursive: true })

// Pass only the environment needed to run a local build, never deployment credentials.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT', 'CI'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
Object.assign(env, {
  NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: '', NEXT_PUBLIC_SENTRY_DSN: '', SENTRY_DSN: '',
})
let metrics = { calls: 0, documents: 0, storageReads: 0 }
let backendErrors = 0
let next, browser, backend, vite
const actual = {}, details = {}

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

function startNext(args) {
  const child = spawn(process.execPath, [nextBin, ...args], { cwd: resolve(root, 'nextjs'), env, stdio: ['ignore', 'pipe', 'pipe'] })
  // Keep diagnostics bounded and do not print arbitrary app logs or environment values.
  child.errors = []
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    if (/error|failed/i.test(String(chunk))) child.errors.push('Next reported an error; inspect the local build/server directly.')
  })
  return child
}

async function stopNext() {
  if (!next || next.exitCode !== null || next.signalCode !== null) return
  const child = next
  const exited = once(child, 'exit')
  child.kill('SIGTERM') // Exact child created by this harness; never a pre-existing server.
  await exited
  next = undefined
}

async function ready(url) {
  for (let i = 0; i < 100; i++) {
    assert.equal(next.exitCode, null, 'Next exited before readiness')
    try {
      if ((await fetch(`${url}/robots.txt`, { signal: AbortSignal.timeout(1000) })).ok) return
    } catch { /* The owned server is still starting. */ }
    await sleep(100)
  }
  throw new Error('Next did not become ready in 10 seconds')
}

async function sample(url, name) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block',
  })
  const page = await context.newPage()
  const scripts = new Set(), errors = []
  // Background Link prefetches are not part of a first navigation.
  await context.route('**/*', async route => {
    const request = route.request()
    if (request.headers()['next-router-prefetch']) return route.fulfill({ status: 204 })
    assert.equal(new URL(request.url()).origin, new URL(url).origin, 'Unexpected external request')
    return route.continue()
  })
  page.on('pageerror', () => errors.push('Browser page error'))
  page.on('response', response => {
    if (response.request().resourceType() === 'script') {
      if (!response.ok()) errors.push('Script request failed')
      scripts.add(new URL(response.url()).pathname)
    }
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.addInitScript(installVitalObservers)
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    assert.equal(response.status(), 200, `${name} navigation failed`)
    await page.getByRole('heading', { level: 1 }).waitFor()
    if (name === 'man') await page.locator('article').getByText('bash manual paragraph 160.', { exact: false }).waitFor({ state: 'attached' })
    if (name === 'search') assert.equal(await page.getByRole('link', { name: /^tar\d+\(1\)$/ }).count(), 20, 'Expected a full search result page')
    if (name === 'section') assert.equal(await page.locator('main a[href^="/man/"]').count(), 32, 'Expected all section fixture pages')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(5000)
    const vitals = await page.evaluate(() => window.__perf)
    assert.ok(vitals.lcp > 0, 'LCP observer did not produce a measurement')
    assert.deepEqual(errors, [], `${name} browser errors`)
    assert.ok(scripts.size > 0, 'No production scripts loaded')
    return { ...vitals, scripts: [...scripts].sort() }
  } finally {
    await context.close()
  }
}

try {
  vite = await createViteServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' })
  const { createFixture } = await vite.ssrLoadModule('/scripts/perf-fixture.ts')
  const fixture = await createFixture(() => metrics.calls++)
  const runtime = globalThis.Convex
  globalThis.Convex = new Proxy(runtime, {
    get(target, key) {
      if (key === 'syscall') return (op, args) => {
        checkQueryShape(op, JSON.parse(args))
        return Reflect.get(target, key)(op, args)
      }
      if (!['asyncSyscall', 'jsSyscall'].includes(key)) return Reflect.get(target, key)
      return async (op, args) => {
        if (key === 'asyncSyscall') checkQueryShape(op, JSON.parse(args))
        const result = await Reflect.get(target, key)(op, args)
        recordSyscall(metrics, op, key === 'asyncSyscall' ? JSON.parse(result) : result)
        return result
      }
    },
  })
  // Verify hooks against the installed runtime before trusting any cost number.
  await fixture.action(makeFunctionReference('perfProbe:nested'), {})
  assert.deepEqual(metrics, { calls: 2, documents: 0, storageReads: 0 }, 'Nested function counter is not installed')
  metrics = { calls: 0, documents: 0, storageReads: 0 }
  await fixture.query(makeFunctionReference('perfProbe:indexed'), {})
  assert.deepEqual(metrics, { calls: 1, documents: 3, storageReads: 0 }, 'Document counter is not installed')
  await assert.rejects(() => fixture.query(makeFunctionReference('perfProbe:filtered'), {}), /unindexed/)
  backend = createServer(async (req, res) => {
    try {
      const method = req.url?.slice('/api/'.length)
      assert.ok(req.method === 'POST' && ['query', 'action', 'mutation'].includes(method), 'Unexpected Convex transport')
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const { path, args, format } = JSON.parse(Buffer.concat(chunks).toString())
      assert.equal(format, 'convex_encoded_json')
      const value = await fixture[method](makeFunctionReference(path), jsonToConvex(args[0]))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'success', value: convexToJson(value), logLines: [] }))
    } catch {
      backendErrors++
      res.writeHead(500)
      res.end('Fixture backend failed')
    }
  })
  const convexUrl = await listen(backend)
  Object.assign(env, { CONVEX_URL: convexUrl, NEXT_PUBLIC_CONVEX_URL: convexUrl, RATE_LIMIT_TAG_KEY: 'perf-fixture-only' })
  const portReservation = createServer()
  const baseUrl = await listen(portReservation)
  await new Promise(resolve => portReservation.close(resolve))
  env.PUBLIC_BASE_URL = baseUrl
  console.log('Building production Next.js against the in-memory fixture…')
  next = startNext(['build'])
  const [code] = await once(next, 'exit')
  assert.equal(code, 0, `Production build failed. ${next.errors.at(-1) ?? ''}`)
  browser = await chromium.launch({ headless: true })
  for (const [name, path] of Object.entries(routes)) {
    // Restart as well as deleting the disk cache: each request has a cold data layer.
    await stopNext()
    await rm(resolve(root, 'nextjs/.next/cache/fetch-cache'), { recursive: true, force: true })
    next = startNext(['start', '-H', '127.0.0.1', '-p', new URL(baseUrl).port])
    await ready(baseUrl)
    metrics = { calls: 0, documents: 0, storageReads: 0 }
    const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(30_000) })
    assert.equal(response.status, 200, `${name} HTML failed`)
    const html = await response.text()
    assert.ok(html.includes(name === 'man' ? 'GNU Bourne-Again SHell' : name === 'home' ? 'Unix manual pages' : 'tar01'), `${name} fixture was not rendered`)
    assert.ok(!html.includes('NEXT_HTTP_ERROR_FALLBACK') && !html.includes('"digest"'), `${name} streamed an error`)
    assert.ok(metrics.calls > 0 && metrics.documents > 0, `${name} must exercise cold Convex reads`)
    actual[`${name}.htmlBytes`] = Buffer.byteLength(html)
    for (const [metric, value] of Object.entries(metrics)) actual[`${name}.${metric}`] = value
    const samples = []
    for (let i = 0; i < (name === 'home' || name === 'man' ? 3 : 1); i++) samples.push(await sample(`${baseUrl}${path}`, name))
    const chunks = [...new Set(samples.flatMap(s => s.scripts))].sort()
    let jsBytes = 0, jsGzipBytes = 0
    for (const chunk of chunks) {
      assert.ok(chunk.startsWith('/_next/static/') && chunk.endsWith('.js'), `Non-build script: ${chunk}`)
      const file = resolve(root, 'nextjs/.next', chunk.slice('/_next/'.length))
      assert.ok(relative(resolve(root, 'nextjs/.next/static'), file).split('/').every(p => p !== '..'))
      const data = await readFile(file)
      jsBytes += data.length
      jsGzipBytes += gzipSync(data, { level: 9 }).length
    }
    actual[`${name}.jsBytes`] = jsBytes
    actual[`${name}.jsGzipBytes`] = jsGzipBytes
    if (name === 'home' || name === 'man') {
      actual[`${name}.lcpMs`] = median(samples.map(s => s.lcp))
      actual[`${name}.cls`] = median(samples.map(s => s.cls))
    }
    details[name] = { path, chunks, samples }
    assert.equal(backendErrors, 0, 'Convex fixture error (including errors swallowed by the app)')
    console.log(`${name}: ${JSON.stringify(Object.fromEntries(Object.entries(actual).filter(([k]) => k.startsWith(`${name}.`))))}`)
  }
  const report = {
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version, chromium: browser.version(), toolchain, fixtureSha256, actual, details,
  }
  await writeFile(resolve(output, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`)
  if (record) {
    budget.metrics = Object.fromEntries(Object.entries(actual).map(([name, baseline]) => [name, {
      baseline,
      relative: /Bytes$/.test(name) ? 0.02 : name.endsWith('.lcpMs') ? 0.5 : 0,
      absolute: name.endsWith('.lcpMs') ? 1000 : name.endsWith('.cls') ? 0.02 : 0,
    }]))
    budget.sourceHead = report.sourceHead
    budget.toolchain = toolchain
    budget.fixtureSha256 = fixtureSha256
    await writeFile(budgetPath, `${JSON.stringify(budget, null, 2)}\n`)
    console.log('Recorded baseline. Review the budget diff before committing.')
  } else {
    const failures = compareBudgets(actual, budget.metrics)
    assert.deepEqual(failures, [], `Performance budget regression:\n${failures.join('\n')}`)
    console.log('All performance budgets passed.')
  }
} finally {
  await browser?.close()
  await stopNext()
  if (backend) await new Promise(resolve => backend.close(resolve))
  await vite?.close()
}
