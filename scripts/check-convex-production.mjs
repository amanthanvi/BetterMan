#!/usr/bin/env node
import { ConvexHttpClient } from 'convex/browser'
import { anyApi as api } from 'convex/server'

const VALID_STAGES = new Set(['staging', 'prod'])
const VALID_DISTROS = new Set(['debian', 'ubuntu', 'fedora', 'arch', 'alpine', 'freebsd', 'macos'])

function usage() {
  console.log(`Usage: pnpm convex:prod-check

Read-only Convex production import check.

Required:
  NEXT_PUBLIC_CONVEX_URL, CONVEX_URL, or VITE_CONVEX_URL

Optional:
  BETTERMAN_DATASET_STAGE=prod
  BETTERMAN_CHECK_DISTROS=debian
  BETTERMAN_MIN_PAGE_COUNT=1
  BETTERMAN_CHECK_JSON=1
`)
}

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

function parseStage() {
  const stage = process.env.BETTERMAN_DATASET_STAGE?.trim() || 'prod'
  if (!VALID_STAGES.has(stage)) {
    throw new Error(`BETTERMAN_DATASET_STAGE must be one of: ${[...VALID_STAGES].join(', ')}`)
  }
  return stage
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

async function checkDistro(client, { stage, distro, minPageCount }) {
  const failures = []
  const golden = GOLDEN_CHECKS[distro]
  const info = await client.query(api.queries.getInfo, { stage, distro })
  if (info.datasetReleaseId === 'uninitialized') {
    failures.push('no active release')
  }
  if (info.pageCount < minPageCount) {
    failures.push(`pageCount ${info.pageCount} < ${minPageCount}`)
  }

  let search = null
  try {
    search = await client.query(api.queries.search, {
      stage,
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

  let page = null
  try {
    page = await client.action(api.content.getManByNameAndSection, {
      stage,
      distro,
      name: golden.name,
      section: golden.section,
    })
    if (!page || page.page?.name !== golden.name || page.page?.section !== golden.section) {
      failures.push(`golden page ${golden.name}/${golden.section} missing`)
    }
  } catch (error) {
    failures.push(`golden page ${golden.name}/${golden.section} failed: ${error.message}`)
  }

  return {
    distro,
    datasetReleaseId: info.datasetReleaseId,
    pageCount: info.pageCount,
    goldenQuery: golden.query,
    goldenTop: search?.results?.[0] ? `${search.results[0].name}(${search.results[0].section})` : null,
    goldenExpected: `${golden.name}(${golden.section})`,
    tarTitle: page?.page?.title ?? null,
    ok: failures.length === 0,
    failures,
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

  const stage = parseStage()
  const distros = parseDistros()
  const minPageCount = parseMinPageCount()
  const client = new ConvexHttpClient(convexUrl)
  const releases = await client.query(api.queries.listSeoReleases, { stage })
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
        ok: false,
        failures: ['missing from active SEO releases'],
      })
      continue
    }
    results.push(await checkDistro(client, { stage, distro, minPageCount }))
  }

  const payload = {
    stage,
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
    }
  }

  return payload.ok ? 0 : 1
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
