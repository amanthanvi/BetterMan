import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { gzipSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { createHash, createHmac } from 'node:crypto'
import { createServer as createViteServer } from 'vite'
import { convexToJson, jsonToConvex } from 'convex/values'
import { makeFunctionReference } from 'convex/server'
import { assertNoManStreaming, checkQueryShape, compareBudgets, installVitalObservers, median, recordBaseline, recordSyscall } from './perf-metrics.mjs'

const root = resolve(import.meta.dirname, '..')
const require = createRequire(resolve(root, 'nextjs/package.json'))
const { chromium } = require('@playwright/test')
const nextBin = require.resolve('next/dist/bin/next')
const budgetPath = resolve(root, 'perf-budgets.json')
const output = resolve(root, '.perf-results')
const routes = { home: '/', man: '/man/bash/1', manProviders: '/man/bash/1', manAlternate: '/man/bash/1?pkg=alternate-shell', search: '/search?q=tar', section: '/section/1' }
const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 1 && ['--record', '--stress'].includes(args[0])) ||
  (args.length === 2 && args[0] === '--record-from'), 'Usage: pnpm perf:check [--record | --record-from measurements.json | --stress]')
const record = args[0] === '--record'
const budget = JSON.parse(await readFile(budgetPath, 'utf8'))
assert.equal(budget.schemaVersion, 1, 'Unsupported budget schema')
if (args[0] === '--record-from') {
  const report = JSON.parse(await readFile(resolve(args[1]), 'utf8'))
  assert.equal(report.fixtureSha256, budget.fixtureSha256, 'Artifact fixture differs from the budget')
  await writeFile(budgetPath, `${JSON.stringify(recordBaseline(budget, report, { labOnly: true }), null, 2)}\n`)
  console.log('Imported Linux CI lab baseline; tolerances and hard byte/read budgets preserved. Review with the perf-budget-change label and Budget section.')
  process.exit(0)
}
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
}
const toolchainDrift = Object.entries(toolchain).filter(([name, version]) => budget.toolchain?.[name] !== version)
if (toolchainDrift.length) console.warn(`Toolchain drift (metrics will still be compared): ${toolchainDrift.map(([name, version]) => `${name} ${budget.toolchain?.[name]} -> ${version}`).join(', ')}`)
// TODO(#390): review roughly 10 independent Linux CI reports before enabling absolute LCP/CLS failures.
console.warn('LCP/CLS are report-only during Linux CI calibration; bytes, reads and LCP minus FCP remain hard limits.')
await mkdir(output, { recursive: true })

// Pass only the environment needed to run a local build, never deployment credentials.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT', 'CI'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
Object.assign(env, {
  NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: '', NEXT_PUBLIC_SENTRY_DSN: '', SENTRY_DSN: '',
})
let metrics = { calls: 0, documents: 0, storageReads: 0 }
let manDataBytes = 0
let manDerivedBytes = 0
let delayManFixture = false
let backendErrors = 0
let next, browser, backend, vite
const previousRateLimitKey = process.env.RATE_LIMIT_TAG_KEY
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

async function sample(url, name, { cost = false, cpuRate = 4, fontDelayMs = 0, clientLcp = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block',
  })
  const page = await context.newPage()
  const scripts = new Set(), errors = [], apiRequests = []
  // Background Link prefetches are not part of a first navigation.
  await context.route('**/*', async route => {
    const request = route.request()
    if (request.headers()['next-router-prefetch']) return route.fulfill({ status: 204 })
    assert.equal(new URL(request.url()).origin, new URL(url).origin, 'Unexpected external request')
    if (request.resourceType() === 'font' && fontDelayMs) await sleep(fontDelayMs)
    return route.continue()
  })
  page.on('pageerror', () => errors.push('Browser page error'))
  page.on('response', response => {
    const path = new URL(response.url()).pathname
    if (path.startsWith('/api/v1/')) {
      apiRequests.push({ path, method: response.request().method(), status: response.status() })
      if (!response.ok()) errors.push(`Page-load API failed: ${path} (${response.status()})`)
    }
    if (response.request().resourceType() === 'script') {
      if (!response.ok()) errors.push('Script request failed')
      scripts.add(new URL(response.url()).pathname)
    }
  })
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/')) errors.push('Page-load API request failed')
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
  await page.addInitScript(installVitalObservers)
  if (clientLcp) await page.addInitScript(() => {
    addEventListener('load', () => setTimeout(() => {
      const paragraph = document.createElement('p')
      paragraph.id = 'perf-client-lcp'
      paragraph.className = 'text-3xl'
      paragraph.textContent = 'Client-rendered primary content. '.repeat(80)
      document.querySelector('article').prepend(paragraph)
    }, 1200), { once: true })
  })
  try {
    // App Router pages fetch dataset info for their footer; plain-HTML man pages render it from the proxy's release.
    const infoReady = name.startsWith('man') ? null : page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/info', { timeout: 30_000 })
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    assert.equal(response.status(), 200, `${name} navigation failed`)
    if (infoReady) await (await infoReady).finished()
    await page.getByRole('heading', { level: 1 }).waitFor()
    if (name === 'man') await page.locator('article').getByText('bash manual paragraph 160.', { exact: false }).waitFor({ state: 'attached' })
    if (name === 'search') assert.equal(await page.getByRole('link', { name: /^tar\d+\(1\)$/ }).count(), 20, 'Expected a full search result page')
    if (name === 'section') assert.equal(await page.locator('main a[href^="/man/"]').count(), 32, 'Expected all section fixture pages')
    await page.evaluate(() => document.fonts.ready)
    if (!cost) await page.waitForTimeout(5000)
    await page.waitForLoadState('networkidle')
    const vitals = await page.evaluate(() => ({
      ...window.__perf,
      navigation: { ttfb: performance.getEntriesByType('navigation')[0].responseStart },
      resources: performance.getEntriesByType('resource').filter(r => r.name.includes('/fonts/'))
        .map(r => ({ path: new URL(r.name).pathname, start: r.startTime, end: r.responseEnd })),
    }))
    assert.ok(vitals.lcp > 0 && vitals.fcp > 0, 'Paint observers did not produce measurements')
    assert.deepEqual(errors, [], `${name} browser errors`)
    assert.ok(scripts.size > 0, 'No production scripts loaded')
    return { ...vitals, cpuRate, fontDelayMs, scripts: [...scripts].sort(), apiRequests,
      ...(cost ? { html: (await response.body()).toString('utf8'), costs: { ...metrics } } : {}),
    }
  } finally {
    await context.close()
  }
}

try {
  process.env.RATE_LIMIT_TAG_KEY = 'perf-fixture-only'
  vite = await createViteServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' })
  const { createFixture, createProviderFixture, createSearchFixture, createBareSearchFixture, createExplainFixture, createExplainMultiFixture, createDerivedResponseFixture } = await vite.ssrLoadModule('/scripts/perf-fixture.ts')
  let fixture = await createFixture(() => metrics.calls++)
  metrics = { calls: 0, documents: 0, storageReads: 0 }
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
  metrics = { calls: 0, documents: 0, storageReads: 0 }
  const rateArgs = { kind: 'page', identifier: 'probe', tag: createHmac('sha256', 'perf-fixture-only').update('probe').digest('hex') }
  await fixture.mutation(makeFunctionReference('rateLimit:consume'), rateArgs)
  await fixture.mutation(makeFunctionReference('rateLimit:consume'), rateArgs)
  assert.deepEqual(metrics, { calls: 2, documents: 1, storageReads: 0 }, 'Rate-limit mutation counter is not installed')
  backend = createServer(async (req, res) => {
    try {
      const method = req.url?.slice('/api/'.length)
      assert.ok(req.method === 'POST' && ['query', 'action', 'mutation'].includes(method), 'Unexpected Convex transport')
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const { path, args, format } = JSON.parse(Buffer.concat(chunks).toString())
      assert.equal(format, 'convex_encoded_json')
      // Force any future loading/Suspense fallback to flush during the cold HTML guard.
      if (delayManFixture) await sleep(150)
      const value = await fixture[method](makeFunctionReference(path), jsonToConvex(args[0]))
      if (path.startsWith('content:getMan') && value?.kind === 'page') {
        const alternate = value.data.providers && value.data.page.sourcePackage !== value.data.providers.defaultPackage
        if (alternate) {
          assert.equal(value.data.page.indexable, false, 'Alternate provider rows stay noindex')
          assert.equal(value.data.derived, undefined, 'Alternates must not borrow canonical derived metadata')
        } else {
          assert.ok(value.data.derived?.version === 2, 'Canonical man data must exercise a ready compact derived snapshot')
          manDerivedBytes = Math.max(manDerivedBytes, Buffer.byteLength(JSON.stringify(value.data.derived)))
        }
        manDataBytes = Math.max(manDataBytes, Buffer.byteLength(JSON.stringify(value.data)))
      }
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
    fixture = await (['manProviders', 'manAlternate'].includes(name) ? createProviderFixture : createFixture)(() => metrics.calls++)
    metrics = { calls: 0, documents: 0, storageReads: 0 }
    manDataBytes = 0
    manDerivedBytes = 0
    delayManFixture = name === 'man'
    const pageView = await sample(`${baseUrl}${path}`, name, { cost: true })
    delayManFixture = false
    const { html, costs } = pageView
    if (name === 'man') assertNoManStreaming(html)
    if (['manProviders', 'manAlternate'].includes(name)) {
      assertNoManStreaming(html)
      assert.ok(html.includes('data-bm-providers') && html.includes('?pkg=alternate-shell') && html.includes('?pkg=same-shell'), 'Provider choices must be rendered')
      if (name === 'manAlternate') assert.ok(html.includes('Alternate shell provider documentation.') && html.includes('<meta name="robots" content="noindex"'), 'The alternate provider must render its own noindex content')
    }
    assert.ok(html.includes(name.startsWith('man') ? 'GNU Bourne-Again SHell' : name === 'home' ? 'Unix manual pages' : 'tar01'), `${name} fixture was not rendered`)
    assert.ok(!html.includes('NEXT_HTTP_ERROR_FALLBACK') && !html.includes('"digest"'), `${name} streamed an error`)
    assert.ok(costs.calls > 0 && costs.documents > 0, `${name} must exercise cold Convex reads`)
    actual[`${name}.htmlBytes`] = Buffer.byteLength(html)
    if (name === 'man') {
      assert.ok(manDataBytes > 0 && manDerivedBytes > 0, 'Ready man API response bytes must be measured')
      actual['man.dataBytes'] = manDataBytes
      actual['man.derivedBytes'] = manDerivedBytes
    }
    for (const [metric, value] of Object.entries(costs)) actual[`${name}.${metric}`] = value
    const samples = []
    for (let i = 0; i < (name === 'home' || name === 'man' ? 5 : 0); i++) samples.push(await sample(`${baseUrl}${path}`, name))
    const chunks = [...new Set([pageView, ...samples].flatMap(s => s.scripts))].sort()
    let jsBytes = 0, jsGzipBytes = 0
    for (const chunk of chunks) {
      // Next's chunks, or the man page script that next.config.ts builds into public/_bm.
      const manScript = /^\/_bm\/man\.[0-9a-f]{16}\.js$/.test(chunk)
      assert.ok(manScript || (chunk.startsWith('/_next/static/') && chunk.endsWith('.js')), `Non-build script: ${chunk}`)
      const base = manScript ? resolve(root, 'nextjs/public/_bm') : resolve(root, 'nextjs/.next/static')
      const file = manScript ? resolve(base, chunk.slice('/_bm/'.length)) : resolve(root, 'nextjs/.next', chunk.slice('/_next/'.length))
      assert.ok(relative(base, file).split('/').every(p => p !== '..'))
      const data = await readFile(file)
      jsBytes += data.length
      jsGzipBytes += gzipSync(data, { level: 9 }).length
    }
    actual[`${name}.jsBytes`] = jsBytes
    actual[`${name}.jsGzipBytes`] = jsGzipBytes
    if (name === 'home' || name === 'man') {
      actual[`${name}.lcpMs`] = median(samples.map(s => s.lcp))
      actual[`${name}.cls`] = median(samples.map(s => s.cls))
      actual[`${name}.lcpAfterFcpMs`] = median(samples.map(s => Math.max(0, s.lcp - s.fcp)))
    }
    details[name] = { path, chunks, pageView: { costs, apiRequests: pageView.apiRequests }, samples }
    if (name === 'man' && args[0] === '--stress') {
      details[name].stress = []
      for (const profile of [
        { cpuRate: 16 }, { cpuRate: 16 }, { fontDelayMs: 650 }, { clientLcp: true },
      ]) {
        const stressSamples = []
        for (let i = 0; i < 5; i++) stressSamples.push(await sample(`${baseUrl}${path}`, name, profile))
        const lag = median(stressSamples.map(s => Math.max(0, s.lcp - s.fcp)))
        details[name].stress.push({ profile, lag, samples: stressSamples })
        console.log(`Man stress ${JSON.stringify(profile)}: median LCP minus FCP ${lag} ms`)
      }
    }
    assert.equal(backendErrors, 0, 'Convex fixture error (including errors swallowed by the app)')
    console.log(`${name}: ${JSON.stringify(Object.fromEntries(Object.entries(actual).filter(([k]) => k.startsWith(`${name}.`))))}`)
  }
  const derivedFixture = await createDerivedResponseFixture(() => metrics.calls++)
  for (const name of ['tar', 'large']) {
    metrics = { calls: 0, documents: 0, storageReads: 0 }
    const result = await derivedFixture.action(makeFunctionReference('content:getManByNameAndSection'), { distro: 'debian', name, section: '1' })
    assert.equal(result?.kind, 'page')
    assert.equal(result.data.derived?.version, 2)
    assert.ok(result.data.derived.portability.total >= (name === 'large' ? 3009 : 100))
    assert.ok(result.data.derived.portability.rows.length <= 256)
    actual[`man.${name}DataBytes`] = Buffer.byteLength(JSON.stringify(result.data))
    actual[`man.${name}DerivedBytes`] = Buffer.byteLength(JSON.stringify(result.data.derived))
    details[`manData${name}`] = { scope: 'ready page data with nonempty options', costs: { ...metrics }, totalOptions: result.data.derived.portability.total, firstPageRows: result.data.derived.portability.rows.length }
  }

  // Direct query costs exclude SSR, hydration and rate-limit work; the original
  // search page-view case above continues to count that complete request scope.
  fixture = await createSearchFixture(() => metrics.calls++)
  for (const [name, q, expected, highlights] of [
    ['searchTypo', 'grpe', 'grep(1)', []],
    ['searchTypoCrowded', 'systemd.servcie', 'systemd.service(5)', []],
    ['searchCitation', 'open(2)', 'open(2)', []],
    ['searchAlias', 'man(7)', 'man(7)', []],
    ['searchFlag', '--gzip', 'gzip0(1)', ['-z, --gzip']],
    ['searchCluster', 'tar -xzf', 'tar(1)', ['-x, --extract', '-z, --gzip', '-f, --file']],
    ['searchCluster8', 'ss -tlnp', 'ss(8)', ['-t', '-l', '-n', '-p']],
  ]) {
    metrics = { calls: 0, documents: 0, storageReads: 0 }
    const result = await fixture.query(makeFunctionReference('queries:search'), {
      distro: 'debian', q, section: null, limit: 20, offset: 0,
    })
    const hit = result.results[0]
    assert.equal(`${hit?.name}(${hit?.section})`, expected, `${name} must resolve the intended page`)
    if (name !== 'searchFlag') assert.equal(result.results.length, 1, `${name} must exclude unrelated results`)
    if (highlights.length) assert.deepEqual(hit.highlights, highlights, `${name} must exercise the intended query path`)
    if (name.startsWith('searchTypo')) {
      assert.equal(result.correctedQuery, hit.name, 'Typo case must use the zero-result correction fallback')
      assert.ok(metrics.documents <= 66, 'Typo query exceeded its document cap')
    } else {
      assert.equal(result.correctedQuery, undefined, 'Ordinary results must not use typo fallback')
    }
    if (highlights.length) {
      assert.equal(hit.match, 'option', 'Flag cases must resolve option rows')
      assert.equal(hit.anchorId, name === 'searchCluster' ? 'extract' : name === 'searchCluster8' ? 't' : 'gzip')
    }
    if (name === 'searchFlag') {
      assert.equal(result.results.length, 20)
      assert.equal(result.hasMore, true)
      assert.ok(metrics.documents <= 43, 'Single flag query exceeded its document cap')
    }
    for (const [metric, value] of Object.entries(metrics)) actual[`${name}.${metric}`] = value
    details[name] = { q, scope: 'direct Convex search query', costs: { ...metrics }, resultCount: result.results.length }
    console.log(`${name}: ${JSON.stringify(metrics)}`)
  }
  fixture = await createBareSearchFixture(() => metrics.calls++)
  metrics = { calls: 0, documents: 0, storageReads: 0 }
  const bare = await fixture.query(makeFunctionReference('queries:search'), { distro: 'debian', q: '-xzf', section: null, limit: 20, offset: 0, brief: true })
  assert.equal(bare.results[0]?.name, 'tar')
  assert.equal(bare.results.length, 6, 'Worst-case bare cluster must resolve six covering candidates')
  assert.deepEqual(bare.results[0].highlights, ['-x, --extract', '-z, --gzip', '-f, --file'])
  assert.equal(bare.top.flags.length, 6, 'Bare cluster must include the saturated top-hit brief')
  assert.ok(metrics.documents <= 40, 'Worst-case bare cluster plus brief exceeded its read cap')
  for (const [metric, value] of Object.entries(metrics)) actual[`searchClusterBare.${metric}`] = value
  details.searchClusterBare = { q: '-xzf', scope: 'direct Convex search with brief', costs: { ...metrics }, resultCount: bare.results.length }
  console.log(`searchClusterBare: ${JSON.stringify(metrics)}`)
  fixture = await createExplainFixture(() => metrics.calls++)
  for (const [name, path, args] of [
    ['searchSymbol', 'queries:search', { distro: 'debian', q: 'ForwardAgent', section: null, limit: 20, offset: 0 }],
    ['explainArchive', 'explain:explain', { distro: 'debian', cmd: 'tar -xzvf backup.tar.gz -C /srv/www' }],
    ['explainPipeline', 'explain:explain', { distro: 'debian', cmd: "find . -name '*.log' -mtime +7 -print0 | xargs -0 rm -f" }],
    ['explainSubcommand', 'explain:explain', { distro: 'debian', cmd: 'git commit -m "message"' }],
    ['explainParentCommand','explain:explain',{distro:'debian',cmd:'systemctl restart nginx'}],
    ['explainMkfsAlias','explain:explain',{distro:'debian',cmd:'mkfs.ext4 /dev/sdb1'}],
    ['explainExecTemplate','explain:explain',{distro:'debian',cmd:'find . -exec truncate -s 0 {} \\;'}],
    ['explainOptional','explain:explain',{distro:'debian',cmd:'rm --interactive never -f file'}],
    ['explainReplace','explain:explain',{distro:'debian',cmd:'xargs -I={} rm ={}'}],
    ['explainRedirectGlob','explain:explain',{distro:'debian',cmd:'echo > *.txt'}],
    ['explainClusterBounded','explain:explain',{distro:'debian',cmd:'rm -'+'r'.repeat(4090)+' x'}],
    ['explainByteBounded','explain:explain',{distro:'debian',cmd:"rm '"+'\u0001'.repeat(4090)+"'"}],
    ['explainOptionalWrapper','explain:explain',{distro:'debian',cmd:'xargs --max-lines rm item'}],
    ['explainInterleaved','explain:explain',{distro:'debian',cmd:'env >out rm item'}],
    ['explainInvalidWrapper','explain:explain',{distro:'debian',cmd:'timeout invalid rm item'}],
    ['explainArgvAssignment','explain:explain',{distro:'debian',cmd:'timeout 1 VAR=value rm item'}],
    ['explainEnvOptions','explain:explain',{distro:'debian',cmd:'env VAR=value -- rm item'}],
    ['explainSudoBoundary','explain:explain',{distro:'debian',cmd:'sudo -- VAR=1 rm item'}],
    ['explainExternalBuiltin','explain:explain',{distro:'debian',cmd:'env command rm item'}],
    ['explainDelimiter','explain:explain',{distro:'debian',cmd:"xargs -d '\\400' rm item"}],
    ['explainMulti', 'explain:explain', { distro: 'debian', cmd: [...'abcdefghijklmnopqrstuvwx'].map(verb=>`git ${verb}`).join('|') }],
    ['explainBounded', 'explain:explain', { distro: 'debian', cmd: 'bounded ' + Array.from({ length: 100 }, (_, i) => `--limit${i}`).join(' ') }],
  ]) {
    if (name === 'explainMulti') fixture = await createExplainMultiFixture(() => metrics.calls++)
    if (name === 'explainBounded') fixture = await createExplainFixture(() => metrics.calls++)
    metrics = { calls: 0, documents: 0, storageReads: 0 }
    const result = await fixture.query(makeFunctionReference(path), args)
    if (name === 'searchSymbol') {
      assert.equal(result.results.length, 8)
      assert.equal(result.results[0].anchorId, 'ForwardAgent')
      assert.equal(result.results[0].name, 'ssh_config')
    } else {
      assert.deepEqual(result.diagnostics, ['explainBounded','explainMulti','explainClusterBounded'].includes(name) ? ['Resolution lookup limit reached','Explanation truncated: lookup limit reached'] : name==='explainByteBounded' ? ['Explanation truncated: output limit reached'] : name==='explainReplace' ? ['Unsupported shell grammar: unquoted opening brace','Unsupported shell grammar: unquoted opening brace'] : name==='explainInvalidWrapper' ? ['Cannot statically unwrap timeout: invalid or missing duration'] : ['explainArgvAssignment','explainEnvOptions','explainSudoBoundary'].includes(name) ? ['Unsupported wrapper executable: assignment or option-like program name'] : name==='explainExternalBuiltin' ? ['Unsupported external executable: shell builtin name'] : name==='explainDelimiter' ? ['Cannot statically unwrap xargs: invalid value for -d'] : [])
      const tokens = result.stages.flatMap(stage => stage.tokens)
      if (name === 'explainBounded') {
        assert.equal(tokens.filter(token => token.kind === 'option').length, 63)
        assert.ok(metrics.documents <= 66, 'Explanation lookup ceiling exceeded')
      } else if(name === 'explainMulti') {
        assert.ok(metrics.documents <= 66, 'Multi-document explanation ceiling exceeded')
        assert.ok(tokens.some(token=>token.kind==='unknown'))
        assert.equal(metrics.documents, 64, 'Saturated multi-row fixture changed its read accounting')
        assert.equal(tokens.filter(token=>token.kind==='subcommand').length, 11, 'Widened lookup ranges changed resolution coverage')
      } else if(['explainClusterBounded','explainByteBounded'].includes(name)) {
        assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=65536,'Serialized response exceeded 64 KiB')
        assert.ok(tokens.length<=256,'Decoded output exceeded 256 tokens')
        assert.ok(result.stages.every(stage=>stage.destructive.length===0))
        if(name==='explainClusterBounded') assert.ok(tokens.filter(token=>token.kind==='option').every(token=>token.text.length<=2))
      } else if(['explainArgvAssignment','explainEnvOptions','explainSudoBoundary','explainExternalBuiltin'].includes(name)) {
        assert.ok(tokens.some(token=>token.kind==='unknown'))
        assert.equal(result.stages.flatMap(s=>s.destructive).length,0)
      } else assert.ok(tokens.every(token => token.kind !== 'unknown'))
      if(name==='explainInterleaved') {
        assert.equal(result.stages[1].tokens[0].value,'rm')
        assert.deepEqual(result.stages.flatMap(s=>s.destructive).map(n=>n.description),['> replaces the contents of the file it writes to.','rm deletes files.'])
      }
      if(name==='explainDelimiter') assert.equal(result.stages.flatMap(s=>s.destructive).length,0)
      if(name==='explainInvalidWrapper') assert.equal(result.stages.flatMap(s=>s.destructive).length,0)
      if (name === 'explainArchive') assert.deepEqual(tokens.filter(token => token.kind === 'option').map(token => token.anchor), ['extract', 'gzip', 'verbose', 'file', 'directory'])
      if (name === 'explainPipeline') {
        assert.ok(result.stages.some(stage => stage.destructive.length === 1))
        assert.equal(tokens.find(token => token.value === '|').shell.anchor, 'shell-pipeline')
      }
      if(name === 'explainParentCommand') {
        assert.equal(tokens.find(token=>token.kind==='subcommand').anchor,'unit-commands-introspection-and-modification')
        assert.equal(tokens.find(token=>token.kind==='subcommand').page.name,'systemctl')
      }
      if(name === 'explainMkfsAlias') assert.equal(result.stages[0].destructive[0].dryRun,'Add `-n` to see what it would do.')
      if(name === 'explainExecTemplate' || name === 'explainReplace') {
        const expansion=tokens.find(token=>token.kind==='expansion')
        assert.equal(expansion.page.name,name === 'explainExecTemplate' ? 'find' : 'xargs')
        assert.equal(expansion.shell,null)
      }
      if(name === 'explainOptionalWrapper') assert.ok(result.stages.some(stage=>stage.destructive.some(note=>note.description==='rm deletes files.')))
      if(name === 'explainOptional') assert.equal(tokens.find(token=>token.value==='never').kind,'argument')
      if(name === 'explainRedirectGlob') {assert.equal(tokens.at(-1).kind,'glob');assert.deepEqual(result.stages[0].destructive,[])}
      if (name === 'explainSubcommand') assert.equal(tokens.find(token => token.kind === 'subcommand').page.name, 'git-commit')
    }
    for (const [metric, value] of Object.entries(metrics)) actual[`${name}.${metric}`] = value
    details[name] = { scope: 'direct Convex query', args, costs: { ...metrics }, result }
    console.log(`${name}: ${JSON.stringify(metrics)}`)
  }
  const report = {
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version, chromium: browser.version(), toolchain, fixtureSha256, actual, details,
    platform: process.platform, ci: process.env.GITHUB_ACTIONS === 'true',
    runUrl: process.env.GITHUB_ACTIONS === 'true' ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    toolchainDrift,
    comparison: compareBudgets(actual, budget.metrics),
  }
  await writeFile(resolve(output, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`)
  if (args[0] === '--stress') {
    for (const { profile, lag } of details.man.stress) {
      const metric = 'man.lcpAfterFcpMs'
      const failed = compareBudgets({ [metric]: lag }, { [metric]: budget.metrics[metric] }).failures.length > 0
      assert.ok(profile.clientLcp ? failed : !failed, `Unexpected stress-gate result: ${JSON.stringify(profile)} lag ${lag}`)
    }
    console.log('Stress profiles passed; the delayed client-rendered LCP control was correctly rejected by the unchanged 100 ms gate.')
  }
  if (record) {
    await writeFile(budgetPath, `${JSON.stringify(recordBaseline(budget, report), null, 2)}\n`)
    console.log('Recorded baseline with existing tolerances preserved. Local recordings preserve Linux lab baselines. Review the guarded budget diff.')
  } else {
    const { failures, warnings } = report.comparison
    for (const warning of warnings) console.warn(`Report-only lab regression: ${warning}`)
    assert.deepEqual(failures, [], `Performance budget regression:\n${failures.join('\n')}`)
    console.log('All performance budgets passed.')
  }
} finally {
  await browser?.close()
  await stopNext()
  if (backend) await new Promise(resolve => backend.close(resolve))
  await vite?.close()
  if (previousRateLimitKey === undefined) delete process.env.RATE_LIMIT_TAG_KEY
  else process.env.RATE_LIMIT_TAG_KEY = previousRateLimitKey
}
