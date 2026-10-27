#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ENDPOINT = 'https://plausible.io/api/v2/query'
const LIMIT = 10_000
const DAY = 86_400_000

export async function exportPlausibleCounts({ env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const key = env.PLAUSIBLE_API_KEY?.trim()
  if (!key) return null
  const siteId = env.PLAUSIBLE_SITE_ID?.trim() || env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()
  if (!siteId) throw new Error('PLAUSIBLE_SITE_ID or NEXT_PUBLIC_PLAUSIBLE_DOMAIN is required')

  // Explicit UTC instants keep all pages on the same 30 complete days, excluding today.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dateRange = [new Date(today - 30 * DAY).toISOString(), new Date(today - 1).toISOString()]
  const pageviews = Object.create(null)
  for (let offset = 0; ; offset += LIMIT) {
    let response
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          metrics: ['pageviews'],
          dimensions: ['event:page'],
          date_range: dateRange,
          order_by: [['event:page', 'asc']],
          pagination: { limit: LIMIT, offset },
        }),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      })
    } catch {
      throw new Error('Plausible query request failed')
    }
    if (!response.ok) throw new Error('Plausible query HTTP failure')
    let data
    try {
      data = await response.json()
    } catch {
      throw new Error('Invalid Plausible query JSON')
    }
    if (!Array.isArray(data?.results) || data.results.length > LIMIT) {
      throw new Error('Invalid Plausible query results')
    }
    for (const row of data.results) {
      if (!Array.isArray(row?.dimensions) || row.dimensions.length !== 1
        || typeof row.dimensions[0] !== 'string' || !row.dimensions[0].startsWith('/')
        || !Array.isArray(row.metrics) || row.metrics.length !== 1
        || !Number.isSafeInteger(row.metrics[0]) || row.metrics[0] < 0) {
        throw new Error('Invalid Plausible page count')
      }
      const [path] = row.dimensions
      if (Object.hasOwn(pageviews, path)) throw new Error('Duplicate Plausible page')
      pageviews[path] = row.metrics[0]
    }
    if (data.results.length < LIMIT) break
  }

  const snapshot = { schemaVersion: 1, siteId, generatedAt: now.toISOString(), dateRange, pageviews }
  const output = env.PLAUSIBLE_COUNTS_OUTPUT?.trim() || '.plausible-counts.json'
  const temporary = join(dirname(output), `.plausible-counts-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' })
    await rename(temporary, output)
  } finally {
    await rm(temporary, { force: true })
  }
  return snapshot
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  exportPlausibleCounts().then((snapshot) => {
    console.log(snapshot ? `Exported ${Object.keys(snapshot.pageviews).length} Plausible page counts.` : 'Plausible counts skipped: no API key.')
  }).catch(() => {
    // Fetch, filesystem and provider errors can contain secrets; never echo them.
    console.error('Plausible counts export failed; prior snapshot preserved.')
    process.exitCode = 1
  })
}
