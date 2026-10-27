import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkQueryShape, compareBudgets, installVitalObservers, instrumentModules, median, recordBaseline, recordSyscall } from './perf-metrics.mjs'

test('counts repeated gets, streamed and paginated documents and blobs', () => {
  const m = { documents: 0, storageReads: 0 }
  for (let i = 0; i < 2; i++) recordSyscall(m, '1.0/get', { _id: 'same-document' })
  recordSyscall(m, '1.0/get', null)
  recordSyscall(m, '1.0/queryStreamNext', { value: { _id: 'filtered-later' }, done: false })
  recordSyscall(m, '1.0/queryStreamNext', { value: null, done: true })
  recordSyscall(m, '1.0/queryPage', { page: [{}, {}] })
  recordSyscall(m, 'storage/getBlob', new Blob(['content']))
  assert.deepEqual(m, { documents: 5, storageReads: 1 })
})

test('instruments real handler entry, preserving registration and nested calls', async () => {
  let calls = 0
  const inner = Object.assign(() => {}, { isQuery: true, _handler: n => n + 1 })
  let module
  const outer = Object.assign(() => {}, { isAction: true, _handler: n => module.inner._handler(n) })
  const modules = instrumentModules({ './queries.ts': async () => ({ inner, outer, constant: 3 }) }, () => calls++)
  module = await modules['./queries.ts']()
  assert.equal(module.outer._handler(5), 6)
  assert.equal(calls, 2)
  assert.equal(module.inner.isQuery, true)
  assert.equal(module.constant, 3)
  assert.equal(inner._handler(1), 2)
  assert.equal(calls, 2, 'Original module must remain untouched')
})

test('budgets accept the boundary, reject regressions and fail closed on missing/invalid metrics', () => {
  const b = { bytes: { baseline: 100, relative: 0.05, absolute: 2 } }
  assert.deepEqual(compareBudgets({ bytes: 107 }, b), { failures: [], warnings: [] })
  assert.equal(compareBudgets({ bytes: 108 }, b).failures.length, 1)
  assert.throws(() => compareBudgets({}, b))
  assert.throws(() => compareBudgets({ bytes: NaN }, b))
  assert.throws(() => compareBudgets({ bytes: 1 }, { bytes: { baseline: 1, relative: -1, absolute: 0 } }))
  assert.equal(median([30, 10, 20]), 20)
})

test('rejects scans and DB filters rather than reporting only surviving rows', () => {
  assert.doesNotThrow(() => checkQueryShape('1.0/queryStream', { query: { source: { type: 'IndexRange' }, operators: [{ limit: 20 }] } }))
  assert.throws(() => checkQueryShape('1.0/queryStream', { query: { source: { type: 'FullTableScan' }, operators: [] } }), /unindexed/)
  assert.throws(() => checkQueryShape('1.0/queryPage', { query: { source: { type: 'IndexRange' }, operators: [{ filter: {} }] } }), /filters/)
})

test('CLS starts at the first shift and respects session boundaries and recent input', () => {
  const callbacks = {}
  const oldWindow = globalThis.window, oldObserver = globalThis.PerformanceObserver
  globalThis.window = {}
  globalThis.PerformanceObserver = class {
    constructor(callback) { this.callback = callback }
    observe({ type }) { callbacks[type] = this.callback }
  }
  try {
    installVitalObservers()
    callbacks.paint({ getEntries: () => [{ name: 'first-paint', startTime: 10 }, { name: 'first-contentful-paint', startTime: 20 }] })
    assert.equal(window.__perf.fcp, 20)
    const shift = (startTime, value, hadRecentInput = false) => callbacks['layout-shift']({ getEntries: () => [{ startTime, value, hadRecentInput }] })
    for (const time of [800, 1700, 2600, 3500, 4400, 5300]) shift(time, 0.01)
    assert.ok(Math.abs(window.__perf.cls - 0.06) < 1e-9, 'Window must extend from 800 to 5800, not from navigation')
    shift(5800, 0.04) // Exactly five seconds starts another session.
    shift(6800, 0.04) // Exactly a one-second gap starts another session.
    shift(6900, 0.5, true)
    assert.ok(Math.abs(window.__perf.cls - 0.06) < 1e-9)
  } finally {
    if (oldWindow === undefined) delete globalThis.window
    else globalThis.window = oldWindow
    if (oldObserver === undefined) delete globalThis.PerformanceObserver
    else globalThis.PerformanceObserver = oldObserver
  }
})

test('lab limits use the capped max formula and warn while machine-independent paint lag stays hard', () => {
  const lab = baseline => ({ baseline, relative: 1.5, absolute: 250, cap: 1000, combine: 'max', reportOnly: true })
  for (const [baseline, limit] of [[50, 300], [172, 430], [208, 520], [500, 1000]]) {
    assert.deepEqual(compareBudgets({ lcp: limit }, { lcp: lab(baseline) }), { failures: [], warnings: [] })
    const result = compareBudgets({ lcp: limit + 1 }, { lcp: lab(baseline) })
    assert.equal(result.failures.length, 0)
    assert.equal(result.warnings.length, 1)
  }
  const policies = { cls: { baseline: 0, relative: 0, absolute: 0.02, reportOnly: true }, lag: { baseline: 0, relative: 0, absolute: 100, cap: 100 } }
  assert.equal(compareBudgets({ cls: 0.5, lag: 100 }, policies).warnings.length, 1)
  assert.equal(compareBudgets({ cls: 0.5, lag: 101 }, policies).failures.length, 1)
  policies.lag.baseline = 50
  assert.equal(compareBudgets({ cls: 0, lag: 101 }, policies).failures.length, 1, 'Recording a nonzero lag cannot move the fixed 100ms ceiling')
})

test('record preserves tolerances/reporting, local lab reference, and metric membership', () => {
  const budget = { metrics: {
    'home.lcpMs': { baseline: 172, relative: 1.5, absolute: 250, cap: 1000, combine: 'max', reportOnly: true },
    'home.jsBytes': { baseline: 100, relative: 0.013, absolute: 7 },
  } }
  const report = { platform: 'darwin', ci: false, actual: { 'home.lcpMs': 50, 'home.jsBytes': 105 } }
  const recorded = recordBaseline(budget, report)
  assert.deepEqual(recorded.metrics['home.lcpMs'], budget.metrics['home.lcpMs'])
  assert.deepEqual(recorded.metrics['home.jsBytes'], { ...budget.metrics['home.jsBytes'], baseline: 105 })
  assert.equal(budget.metrics['home.jsBytes'].baseline, 100)
  assert.throws(() => recordBaseline(budget, { ...report, actual: {} }), /silently add or remove/)
  assert.throws(() => recordBaseline(budget, report, { labOnly: true }), /Linux CI/)
})

test('Linux artifact import requires five samples, verifies medians and changes only lab baselines', () => {
  const metrics = {}, actual = {}, details = {}
  for (const name of ['home', 'man']) {
    metrics[`${name}.lcpMs`] = { baseline: 100, relative: 1.5, absolute: 250, cap: 1000, combine: 'max', reportOnly: true }
    metrics[`${name}.cls`] = { baseline: 0, relative: 0, absolute: 0.02, reportOnly: true }
    details[name] = { samples: [170, 180, 190, 200, 210].map(lcp => ({ lcp, cls: 0.01 })) }
    actual[`${name}.lcpMs`] = 190
    actual[`${name}.cls`] = 0.01
  }
  metrics.bytes = { baseline: 5, relative: 0.02, absolute: 0 }
  actual.bytes = 50
  const report = { platform: 'linux', ci: true, actual, details, sourceHead: 'a'.repeat(40) }
  const result = recordBaseline({ metrics }, report, { labOnly: true })
  assert.deepEqual(result.metrics['home.lcpMs'], { ...metrics['home.lcpMs'], baseline: 190 })
  assert.equal(result.metrics.bytes.baseline, 5)
  assert.equal(result.labBaseline.samplesPerRoute, 5)
  for (const [key, invalid] of [['lcp', -100], ['lcp', 0], ['cls', -0.01]]) {
    const modified = structuredClone(report)
    modified.details.home.samples[0][key] = invalid
    assert.throws(() => recordBaseline({ metrics }, modified, { labOnly: true }), /Invalid .* sample/)
  }
  report.details.home.samples.pop()
  assert.throws(() => recordBaseline({ metrics }, report, { labOnly: true }), /five samples/)
})
