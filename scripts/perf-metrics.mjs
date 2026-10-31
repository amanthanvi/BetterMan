import assert from 'node:assert/strict'

// Count documents at the runtime boundary, including repeated reads and rows
// consumed before application filtering, rather than counting response items.
export function recordSyscall(metrics, op, result) {
  if (op === '1.0/get' && result !== null) metrics.documents++
  if (op === '1.0/queryStreamNext' && !result.done && result.value !== null) metrics.documents++
  if (op === '1.0/queryPage') metrics.documents += result.page.length
  if (op === 'storage/getBlob' && result !== null) metrics.storageReads++
}

// Fixture mutations use platform limits; every tested search still has its actual read budget.
/** @template T @param {() => Promise<T>} run @param {number} limit @returns {Promise<T>} */
export async function withDocumentBudget(run, limit) {
  const runtime = globalThis.Convex
  const metrics = { documents: 0, storageReads: 0 }
  globalThis.Convex = new Proxy(runtime, {
    get(target, key) {
      if (!['asyncSyscall', 'jsSyscall'].includes(key)) return Reflect.get(target, key)
      return async (op, args) => {
        const result = await Reflect.get(target, key)(op, args)
        recordSyscall(metrics, op, key === 'asyncSyscall' ? JSON.parse(result) : result)
        return result
      }
    },
  })
  try {
    const result = await run()
    assert.ok(metrics.documents <= limit, `Search read ${metrics.documents} documents; limit ${limit}`)
    return result
  } finally { globalThis.Convex = runtime }
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
  window.__perf = { fcp: 0, lcp: 0, cls: 0, candidates: [], shifts: [], fonts: [] }
  const describe = source => {
    const node = source?.nodeType === 3 ? source.parentElement : source
    return node ? {
      tag: node.tagName, id: node.id, className: String(node.className).slice(0, 160),
      text: node.textContent?.slice(0, 120), font: getComputedStyle(node).font,
    } : null
  }
  if (typeof document !== 'undefined') {
    for (const type of ['loading', 'loadingdone', 'loadingerror']) document.fonts.addEventListener(type, event => {
      window.__perf.fonts.push({ type, time: performance.now(), faces: [...(event.fontfaces ?? [])].map(face => ({ family: face.family, status: face.status })) })
    })
  }
  let windowStart = null, lastShift = 0, score = 0
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') {
      window.__perf.fcp = entry.startTime
    }
  }).observe({ type: 'paint', buffered: true })
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      window.__perf.lcp = entry.startTime
      window.__perf.candidates.push({ time: entry.startTime, size: entry.size, element: describe(entry.element) })
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true })
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue
      window.__perf.shifts.push({ time: entry.startTime, value: entry.value,
        sources: (entry.sources ?? []).map(source => ({ node: describe(source.node), previous: source.previousRect, current: source.currentRect })),
      })
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

export function assertNoManStreaming(html) {
  assert.doesNotMatch(html, /\$RC|\$RT|\bid=["']B:|<!--\$(?:\?|~)-->/,
    'Man page must ship visible document HTML without pending Suspense boundaries')
}

export function compareBudgets(actual, budgets) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(budgets).sort(), 'Metric set changed; review the baseline')
  const failures = [], warnings = []
  for (const [name, { baseline, relative, absolute, cap, combine = 'sum', reportOnly = false }] of Object.entries(budgets)) {
    assert.ok([baseline, relative, absolute, actual[name]].every(n => Number.isFinite(n) && n >= 0), `Invalid metric: ${name}`)
    assert.ok(['sum', 'max'].includes(combine) && typeof reportOnly === 'boolean', `Invalid policy: ${name}`)
    assert.ok(cap === undefined || (Number.isFinite(cap) && cap >= 0), `Invalid cap: ${name}`)
    const limit = Math.min(cap ?? Infinity, combine === 'max'
      ? Math.max(baseline * (1 + relative), baseline + absolute)
      : baseline * (1 + relative) + absolute)
    if (actual[name] > limit) (reportOnly ? warnings : failures).push(`${name}: ${actual[name]} > ${Number(limit.toFixed(3))} (baseline ${baseline})`)
  }
  return { failures, warnings }
}

export function recordBaseline(budget, report, { labOnly = false } = {}) {
  const result = structuredClone(budget)
  const isLab = name => /\.(lcpMs|cls)$/.test(name)
  const linuxCi = report.platform === 'linux' && report.ci === true
  if (labOnly) assert.ok(linuxCi, 'Import lab baselines only from a Linux CI artifact')
  if (linuxCi) {
    for (const name of ['home', 'man']) {
      const samples = report.details[name].samples
      assert.equal(samples.length, 5, 'Lab baseline requires five samples per route')
      for (const [metric, sampleKey] of [['lcpMs', 'lcp'], ['cls', 'cls']]) {
        assert.ok(samples.every(s => Number.isFinite(s[sampleKey]) &&
          (sampleKey === 'lcp' ? s[sampleKey] > 0 : s[sampleKey] >= 0)), `Invalid ${sampleKey} sample`)
        assert.equal(report.actual[`${name}.${metric}`], median(samples.map(s => s[sampleKey])), 'Artifact median mismatch')
      }
    }
  }
  if (!labOnly) assert.deepEqual(Object.keys(report.actual).sort(), Object.keys(budget.metrics).sort(), 'Recording cannot silently add or remove metrics')
  for (const [name, policy] of Object.entries(result.metrics)) {
    if (labOnly && !isLab(name)) continue
    if (isLab(name) && !linuxCi) continue
    const value = report.actual[name]
    assert.ok(Number.isFinite(value) && value >= 0, `Invalid baseline: ${name}`)
    policy.baseline = value // Preserve all tolerances and reporting policy.
  }
  if (linuxCi) result.labBaseline = {
    platform: 'linux', samplesPerRoute: 5, sourceHead: report.sourceHead, runUrl: report.runUrl,
    node: report.node, chromium: report.chromium,
  }
  if (!labOnly) {
    result.sourceHead = report.sourceHead
    result.toolchain = report.toolchain
    result.fixtureSha256 = report.fixtureSha256
  }
  return result
}

export function median(values) {
  assert.ok(values.length > 0 && values.every(Number.isFinite))
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}
