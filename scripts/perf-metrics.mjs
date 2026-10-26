import assert from 'node:assert/strict'

// Count documents at the runtime boundary, including repeated reads and rows
// consumed before application filtering, rather than counting response items.
export function recordSyscall(metrics, op, result) {
  if (op === '1.0/get' && result !== null) metrics.documents++
  if (op === '1.0/queryStreamNext' && !result.done && result.value !== null) metrics.documents++
  if (op === '1.0/queryPage') metrics.documents += result.page.length
  if (op === 'storage/getBlob' && result !== null) metrics.storageReads++
}

// convex-test injects runQuery/runAction directly, bypassing call syscalls.
// Wrap registered handlers in its module map to include nested invocations.
export function instrumentModules(modules, onCall) {
  return Object.fromEntries(Object.entries(modules).map(([path, load]) => [path, async () =>
    Object.fromEntries(Object.entries(await load()).map(([name, value]) => [name,
      typeof value === 'function' && typeof value._handler === 'function'
        ? { ...value, _handler: (...args) => { onCall(); return value._handler(...args) } }
        : value,
    ])),
  ]))
}

export function checkQueryShape(op, args) {
  if (op !== '1.0/queryStream' && op !== '1.0/queryPage') return
  assert.ok(['IndexRange', 'Search'].includes(args.query.source.type), 'Budget harness rejects unindexed scans')
  assert.ok(args.query.operators.every(operator => !('filter' in operator)), 'Budget harness rejects DB filters that hide scanned rows')
}

// Self-contained so Playwright can install this exact function before navigation.
export function installVitalObservers() {
  window.__perf = { lcp: 0, cls: 0 }
  let windowStart = null, lastShift = 0, score = 0
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime
  }).observe({ type: 'largest-contentful-paint', buffered: true })
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue
      if (windowStart === null || entry.startTime - lastShift >= 1000 || entry.startTime - windowStart >= 5000) {
        windowStart = entry.startTime
        score = 0
      }
      score += entry.value
      lastShift = entry.startTime
      window.__perf.cls = Math.max(window.__perf.cls, score)
    }
  }).observe({ type: 'layout-shift', buffered: true })
}

export function compareBudgets(actual, budgets) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(budgets).sort(), 'Metric set changed; review the baseline')
  const failures = []
  for (const [name, { baseline, relative, absolute }] of Object.entries(budgets)) {
    assert.ok([baseline, relative, absolute, actual[name]].every(n => Number.isFinite(n) && n >= 0), `Invalid metric: ${name}`)
    const limit = baseline * (1 + relative) + absolute
    if (actual[name] > limit) failures.push(`${name}: ${actual[name]} > ${Number(limit.toFixed(3))} (baseline ${baseline})`)
  }
  return failures
}

export function median(values) {
  assert.ok(values.length > 0 && values.every(Number.isFinite))
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}
