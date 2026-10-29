import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery } from '../convex/_generated/server'
import { distroValidator } from '../convex/schema'
import { persistOptionSignature } from '../convex/_derivedInputs'

// Copied into the Convex function directory only by the loopback-only benchmark.
export const body = internalAction({
  args: { changed: v.boolean() },
  handler: async (ctx, args) => {
    const options = ['create', 'extract', 'file', 'verbose', 'list', 'sort', 'help', 'version'].map((key, index) => ({
      flags: `-${String.fromCharCode(97 + index)}, --${key}`, anchorId: key,
      argument: key === 'file' ? 'PATH' : null, description: 'synthetic option',
    }))
    if (args.changed) options.push({ flags: '--changed', anchorId: 'changed', argument: null, description: 'synthetic new option' })
    const blob = new Blob([JSON.stringify({ content: {
      docJson: JSON.stringify({ blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'long synthetic manual '.repeat(25_000) }] }], toc: [] }),
      optionsJson: JSON.stringify(options),
    } })])
    return { storageId: await ctx.storage.store(blob), bytes: blob.size }
  },
})
export const seed = internalMutation({
  args: {
    datasetReleaseId: v.string(), distro: distroValidator, offset: v.number(),
    count: v.number(), total: v.number(), changedCount: v.number(), version: v.number(),
    baseStorageId: v.id("_storage"), changedStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    if (args.count < 1 || args.count > 100 || args.offset < 0 || args.offset + args.count > args.total) throw new Error('BENCHMARK_BATCH_LIMIT')
    let release = await ctx.db.query('datasetReleases').withIndex('by_datasetReleaseId', q => q.eq('datasetReleaseId', args.datasetReleaseId)).unique()
    if (!release) {
      const releaseId = await ctx.db.insert('datasetReleases', {
        datasetReleaseId: args.datasetReleaseId, locale: 'en', distro: args.distro,
        imageRef: 'local-synthetic', imageDigest: 'local-synthetic',
        ingestedAt: `2026-${String(args.version + 6).padStart(2, '0')}-01T00:00:00Z`,
        pageCount: args.total, sealed: true, manifestVerified: true,
        relatedMetadataVersion: 0, relatedMetadataCompletedVersion: 0,
      })
      release = await ctx.db.get(releaseId)
    }
    if (!release) throw new Error('BENCHMARK_RELEASE_MISSING')
    for (let i = args.offset; i < args.offset + args.count; i++) {
      const name = `bench-${String(i).padStart(6, '0')}`
      const existing = await ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId', release._id).eq('name', name).eq('section', '1')).unique()
      if (existing) continue
      const changed = i < args.changedCount
      const contentSha256 = `synthetic-source-${i}-${changed ? args.version : 1}`
      const pageId = await ctx.db.insert('manPages', {
        releaseId: release._id, datasetReleaseId: args.datasetReleaseId, externalId: name,
        locale: 'en', distro: args.distro, name, section: '1', sitemapPage: 0,
        title: `${name}(1)`, description: 'synthetic multi-distro command', sourcePath: `${name}.1`,
        sourcePackage: `package-${i}`, sourcePackageVersion: changed ? String(args.version) : '1',
        contentSha256, hasParseWarnings: false,
      })
      const options = ['create', 'extract', 'file', 'verbose', 'list', 'sort', 'help', 'version'].map((key, index) => ({
        flags: `-${String.fromCharCode(97 + index)}, --${key}`, anchorId: key,
        argument: key === 'file' ? 'PATH' : null, description: 'synthetic option',
      }))
      if (changed) options.push({ flags: '--changed', anchorId: 'changed', argument: null, description: 'synthetic new option' })
      await ctx.db.insert('manPageContents', {
        pageId, contentSha256, storageId: changed ? args.changedStorageId : args.baseStorageId,
      })
      await persistOptionSignature(ctx, pageId, options, 1)
    }
    return { releaseId: release._id, seeded: args.count }
  },
})

export const pointStaging = internalMutation({
  args: { datasetReleaseId: v.string() },
  handler: async (ctx, args) => {
    const release = await ctx.db.query('datasetReleases').withIndex('by_datasetReleaseId', q => q.eq('datasetReleaseId', args.datasetReleaseId)).unique()
    if (!release) throw new Error('BENCHMARK_RELEASE_MISSING')
    const current = await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro', q => q.eq('stage', 'staging').eq('locale', 'en').eq('distro', release.distro)).unique()
    const value = { stage: 'staging' as const, locale: 'en', distro: release.distro, releaseId: release._id, datasetReleaseId: release.datasetReleaseId, activatedAt: new Date().toISOString() }
    if (current) await ctx.db.replace(current._id, value)
    else await ctx.db.insert('activeReleases', value)
    return null
  },
})

export const counters = internalQuery({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.system.query('_scheduled_functions').take(5001)
    const scheduled: Record<string, number> = {}
    for (const job of jobs) scheduled[job.state.kind] = (scheduled[job.state.kind] ?? 0) + 1
    const builds = await ctx.db.query('derivedBuilds').withIndex('by_locale', q => q.eq('locale', 'en')).unique()
    return { scheduled, scheduledCapped: jobs.length > 5000, build: builds }
  },
})
