import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkQueryShape, compareBudgets, installVitalObservers, instrumentModules, median, recordSyscall } from './perf-metrics.mjs'

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
  assert.deepEqual(compareBudgets({ bytes: 107 }, b), [])
  assert.equal(compareBudgets({ bytes: 108 }, b).length, 1)
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
