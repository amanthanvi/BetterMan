#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
let api

const VALID_DISTROS = new Set(['debian', 'ubuntu', 'fedora', 'arch', 'alpine', 'freebsd', 'macos'])

function usage() {
  console.log(`Usage: pnpm convex:prod-check

Read-only Convex production import check.

Required:
  NEXT_PUBLIC_CONVEX_URL, CONVEX_URL, or VITE_CONVEX_URL

Optional:
  BETTERMAN_CHECK_DISTROS=debian
  BETTERMAN_EXPECTED_RELEASE_IDS='{"debian":"<datasetReleaseId>"}'
  BETTERMAN_MIN_PAGE_COUNT=1
  BETTERMAN_CHECK_JSON=1
  BETTERMAN_CHECK_RANKING=seed  # fatal tar-first assertions only for the E2E seed
`)
}

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

function parseDistros() {
  const raw = process.env.BETTERMAN_CHECK_DISTROS?.trim() || 'debian'
  const distros = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (!distros.length) throw new Error('BETTERMAN_CHECK_DISTROS must include at least one distro')
  for (const distro of distros) {
    if (!VALID_DISTROS.has(distro)) {
      throw new Error(`Unsupported distro in BETTERMAN_CHECK_DISTROS: ${distro}`)
    }
  }
  return [...new Set(distros)]
}

function parseMinPageCount() {
  const raw = process.env.BETTERMAN_MIN_PAGE_COUNT?.trim() || '1'
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < 1) {
    throw new Error('BETTERMAN_MIN_PAGE_COUNT must be a positive integer')
  }
  return value
}

// When set, every checked distro must be active at exactly this release id.
function parseExpectedReleaseIds(distros) {
  const raw = process.env.BETTERMAN_EXPECTED_RELEASE_IDS?.trim()
  if (!raw) return null
  let expected
  try {
    expected = JSON.parse(raw)
  } catch {
    throw new Error('BETTERMAN_EXPECTED_RELEASE_IDS must be a JSON object of distro to datasetReleaseId')
  }
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    throw new Error('BETTERMAN_EXPECTED_RELEASE_IDS must be a JSON object of distro to datasetReleaseId')
  }
  for (const distro of distros) {
    if (typeof expected[distro] !== 'string' || !expected[distro]) {
      throw new Error(`BETTERMAN_EXPECTED_RELEASE_IDS has no release id for ${distro}`)
    }
  }
  return expected
}

const GOLDEN_CHECKS = {
  debian: { query: 'tarr', name: 'tar', section: '1' },
  ubuntu: { query: 'tarr', name: 'tar', section: '1' },
  fedora: { query: 'tarr', name: 'tar', section: '1' },
  arch: { query: 'git', name: 'git', section: '1' },
  alpine: { query: 'busybox', name: 'busybox', section: '1' },
  freebsd: { query: 'tar', name: 'tar', section: '1' },
  macos: { query: 'tar', name: 'tar', section: '1' },
}

function hasGoldenPage(results, golden) {
  return results.some((result) => result.name === golden.name && result.section === golden.section)
}

// Corpus ranking is advisory at deploy/promotion: a data refresh must not strand the frontend.
// Seed mode is explicit and fatal; the original availability/content goldens remain fatal in every mode.
export async function checkRanking(client, distro, strict = false) {
  const failures = [], warnings = []
  const issues = strict ? failures : warnings
  if (distro !== 'debian') return { failures, warnings }
  for (const q of ['how do I extract a tarball', 'extract a tar archive', 'extract tarball', '--extract', '-xzf']) {
    try {
      const result = await client.query('queries:search', { distro, q, section: null, limit: 5, offset: 0 })
      const candidates = result.results.slice(0, strict ? 1 : 3)
      if (!candidates.some(hit => hit.name === 'tar' && hit.section === '1')) {
        issues.push(`ranking search ${q} did not place tar(1) in ${strict ? 'first place' : 'the top 3'}`)
      }
    } catch (error) {
      issues.push(`ranking search ${q} failed: ${error.message}`)
    }
  }
  return { failures, warnings }
}

async function checkDistro(client, { distro, minPageCount, expectedReleaseId }) {
  const failures = []
  const golden = GOLDEN_CHECKS[distro]
  const info = await client.query(api.queries.getInfo, { distro })
  if (info.datasetReleaseId === 'uninitialized') {
    failures.push('no active release')
  }
  if (expectedReleaseId && info.datasetReleaseId !== expectedReleaseId) {
    failures.push(`active release ${info.datasetReleaseId} != expected ${expectedReleaseId}`)
  }
  if (info.pageCount < minPageCount) {
    failures.push(`pageCount ${info.pageCount} < ${minPageCount}`)
  }

  let search = null
  try {
    search = await client.query(api.queries.search, {
      distro,
      q: golden.query,
      section: null,
      limit: 5,
      offset: 0,
    })
    if (!hasGoldenPage(search.results, golden)) {
      failures.push(`golden search ${golden.query} did not include ${golden.name}(${golden.section})`)
    }
  } catch (error) {
    failures.push(`golden search ${golden.query} failed: ${error.message}`)
  }

  const ranking = await checkRanking(client, distro, process.env.BETTERMAN_CHECK_RANKING === 'seed')
  failures.push(...ranking.failures)

  let page = null
  try {
    // getManByNameAndSection returns { kind: 'page', data } or { kind: 'alias', ... }.
    const result = await client.action(api.content.getManByNameAndSection, {
      distro,
      name: golden.name,
      section: golden.section,
    })
    page = result?.kind === 'page' ? result.data : null
    if (result?.kind === 'alias') {
      failures.push(`golden page ${golden.name}/${golden.section} is an alias of ${result.name}(${result.section})`)
    } else if (!page || page.page?.name !== golden.name || page.page?.section !== golden.section) {
      failures.push(`golden page ${golden.name}/${golden.section} missing`)
    } else if (page.page.datasetReleaseId !== info.datasetReleaseId) {
      failures.push(`golden page release ${page.page.datasetReleaseId} != active ${info.datasetReleaseId}`)
    }
  } catch (error) {
    failures.push(`golden page ${golden.name}/${golden.section} failed: ${error.message}`)
  }

  try {
    const resolved = await client.query(api.queries.resolveManByName, { distro, name: golden.name })
    const sections = resolved.kind === 'page'
      ? [resolved.section]
      : resolved.kind === 'ambiguous' ? resolved.options.map((option) => option.section) : []
    if (!sections.includes(golden.section)) {
      failures.push(`golden name ${golden.name} did not resolve to section ${golden.section}`)
    }
  } catch (error) {
    failures.push(`golden name ${golden.name} failed: ${error.message}`)
  }

  let metadata = null
  try {
    metadata = await client.query(api.queries.getManMetaByNameAndSection, {
      distro,
      name: golden.name,
      section: golden.section,
    })
    if (!metadata || metadata.page?.name !== golden.name || metadata.page?.section !== golden.section) {
      failures.push(`golden metadata ${golden.name}/${golden.section} missing`)
    } else {
      if (typeof metadata.page.title !== 'string' || !metadata.page.title.trim()) {
        failures.push(`golden metadata ${golden.name}/${golden.section} has an empty title`)
      }
      if (metadata.page.datasetReleaseId !== info.datasetReleaseId) {
        failures.push(`golden metadata release ${metadata.page.datasetReleaseId} != active ${info.datasetReleaseId}`)
      }
    }
  } catch (error) {
    failures.push(`golden metadata ${golden.name}/${golden.section} failed: ${error.message}`)
  }

  return {
    distro,
    datasetReleaseId: info.datasetReleaseId,
    pageCount: info.pageCount,
    goldenQuery: golden.query,
    goldenTop: search?.results?.[0] ? `${search.results[0].name}(${search.results[0].section})` : null,
    goldenExpected: `${golden.name}(${golden.section})`,
    tarTitle: page?.page?.title ?? null,
    metadataTitle: metadata?.page?.title ?? null,
    ok: failures.length === 0,
    failures,
    rankingWarnings: ranking.warnings,
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage()
    return 0
  }

  const convexUrl = firstEnv('NEXT_PUBLIC_CONVEX_URL', 'CONVEX_URL', 'VITE_CONVEX_URL')
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL, CONVEX_URL, or VITE_CONVEX_URL is required')
  }

  const distros = parseDistros()
  const minPageCount = parseMinPageCount()
  const expectedReleaseIds = parseExpectedReleaseIds(distros)
  const { ConvexHttpClient } = await import('convex/browser')
  const { anyApi } = await import('convex/server')
  api = anyApi
  const client = new ConvexHttpClient(convexUrl)
  const releases = await client.query(api.queries.listSeoReleases, {})
  const activeDistros = new Set(releases.items.map((item) => item.distro))
  const results = []

  for (const distro of distros) {
    if (!activeDistros.has(distro)) {
      results.push({
        distro,
        datasetReleaseId: null,
        pageCount: 0,
        goldenQuery: GOLDEN_CHECKS[distro]?.query ?? null,
        goldenTop: null,
        goldenExpected: GOLDEN_CHECKS[distro]
          ? `${GOLDEN_CHECKS[distro].name}(${GOLDEN_CHECKS[distro].section})`
          : null,
        tarTitle: null,
        metadataTitle: null,
        ok: false,
        failures: ['missing from active SEO releases'],
      })
      continue
    }
    results.push(await checkDistro(client, { distro, minPageCount, expectedReleaseId: expectedReleaseIds?.[distro] }))
  }

  const payload = {
    stage: 'prod',
    checkedDistros: distros,
    activeReleaseCount: releases.items.length,
    urlsPerFile: releases.urlsPerFile,
    ok: results.every((result) => result.ok),
    results,
  }

  if (process.env.BETTERMAN_CHECK_JSON === '1') {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    for (const result of results) {
      const status = result.ok ? 'ok' : 'fail'
      console.log(
        `${status} ${result.distro} release=${result.datasetReleaseId ?? 'none'} pages=${result.pageCount} golden=${result.goldenQuery ?? 'none'} expected=${result.goldenExpected ?? 'none'} top=${result.goldenTop ?? 'none'}`,
      )
      for (const failure of result.failures) console.log(`  - ${failure}`)
      for (const warning of result.rankingWarnings ?? []) console.log(`  ranking advisory: ${warning}`)
    }
  }

  return payload.ok ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
