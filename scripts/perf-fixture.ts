/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import schema from '../convex/schema'
import { serializeStoredPayload } from '../convex/_storedPayload'
import { optionFlagRows } from '../convex/_optionFlags'
import { instrumentModules } from './perf-metrics.mjs'
import { actionGeneric, makeFunctionReference, queryGeneric } from 'convex/server'

// A fixed corpus: all seven variants, stored content, cached related metadata,
// a long document, and enough search hits to exercise first-page limits.
export async function createFixture(onCall: () => void) {
  const modules = {
    ...import.meta.glob('../convex/**/*.ts'),
    '../convex/perfProbe.ts': async () => ({
      empty: queryGeneric({ args: {}, handler: async () => null }),
      nested: actionGeneric({ args: {}, handler: async ctx => ctx.runQuery(makeFunctionReference('perfProbe:empty'), {}) }),
      indexed: queryGeneric({ args: {}, handler: async ctx => {
        const active = await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro', q =>
          q.eq('stage', 'prod').eq('locale', 'en').eq('distro', 'debian')).unique()
        await ctx.db.get(active.releaseId)
        await ctx.db.get(active.releaseId)
        return null
      } }),
      filtered: queryGeneric({ args: {}, handler: async ctx =>
        ctx.db.query('activeReleases').filter(q => q.eq(q.field('distro'), 'debian')).collect() }),
    }),
  }
  const t = convexTest(schema, instrumentModules(modules, onCall))
  await t.run(async (ctx) => {
    for (const distro of ['debian', 'ubuntu', 'fedora', 'arch', 'alpine', 'freebsd', 'macos'] as const) {
      const datasetReleaseId = `2026-10-26+perf-v1-${distro}`
      const releaseId = await ctx.db.insert('datasetReleases', {
        datasetReleaseId, distro, locale: 'en', imageRef: 'fixture', imageDigest: 'fixture',
        ingestedAt: '2026-10-26T00:00:00Z', pageCount: 32, sealed: true,
      })
      await ctx.db.insert('activeReleases', {
        stage: 'prod', locale: 'en', distro, releaseId, datasetReleaseId, activatedAt: '2026-10-26T00:00:00Z',
      })
      await ctx.db.insert('releaseSectionStats', { releaseId, datasetReleaseId, section: '1', label: 'User Commands', total: 32 })
      const pages = []
      for (let i = 0; i < 32; i++) {
        const name = i === 0 ? 'bash' : `tar${String(i).padStart(2, '0')}`
        const description = i === 0 ? 'GNU Bourne-Again SHell' : 'create and extract archives'
        const contentSha256 = `fixture-${name}`
        const pageId = await ctx.db.insert('manPages', {
          releaseId, datasetReleaseId, externalId: `${distro}-${name}`, locale: 'en', distro,
          name, section: '1', sitemapPage: 1, title: `${name}(1)`, description,
          sourcePath: `/fixture/${name}.1`, contentSha256, hasParseWarnings: false,
        })
        pages.push({ pageId, name, description })
        await ctx.db.insert('manPageSearchDocuments', {
          pageId, releaseId, datasetReleaseId, name, nameNorm: name, section: '1', title: `${name}(1)`,
          description, descNorm: description.toLowerCase(), searchText: `${name} ${description}`, snippetText: description,
        })
        const blocks = [
          { type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' },
          ...Array.from({ length: i === 0 ? 160 : 1 }, (_, n) => ({
            type: 'paragraph', inlines: [{ type: 'text', text: `${name} manual paragraph ${n + 1}. The shell reads commands from standard input or a file and executes them. Use the options below to control its behavior.` }],
          })),
          { type: 'heading', id: 'examples', level: 2, text: 'EXAMPLES' },
          { type: 'code_block', id: 'example', text: 'if [ -n "$1" ]; then\n  printf "%s\\n" "$1"\nfi', languageHint: 'bash' },
        ]
        const storageId = await ctx.storage.store(new Blob([serializeStoredPayload(contentSha256, {
          docJson: JSON.stringify({ toc: [{ id: 'description', title: 'DESCRIPTION', level: 2 }, { id: 'examples', title: 'EXAMPLES', level: 2 }], blocks }),
          synopsisJson: JSON.stringify([`${name} [options] [file]`]),
        })]))
        const blobId = await ctx.db.insert('manPageContentBlobs', { contentSha256, storageId })
        await ctx.db.insert('manPageContents', { pageId, blobId, contentSha256 })
      }
      await ctx.db.insert('manPageLinks', {
        releaseId, fromPageId: pages[0].pageId, fromExternalId: `${distro}-bash`,
        toName: pages[1].name, toSection: '1', toExternalId: `${distro}-${pages[1].name}`,
        toTitle: `${pages[1].name}(1)`, toDescription: pages[1].description, linkType: 'see_also',
      })
    }
  })
  return t
}

// Extra query-only data keeps the original browser page-view corpus unchanged.
export async function createSearchFixture(onCall: () => void) {
  const t = await createFixture(onCall)
  await t.run(async ctx => {
    const active = await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro', q =>
      q.eq('stage', 'prod').eq('locale', 'en').eq('distro', 'debian')).unique()
    const { releaseId, datasetReleaseId } = active!
    const gzip = { flags: '-z, --gzip', anchorId: 'gzip' }
    const specs = [
      { name: 'grep', section: '1', description: 'search text patterns', options: [] },
      { name: 'systemd.service', section: '5', description: 'service configuration', options: [] },
      { name: 'open', section: '1', description: 'launch resources', options: [] },
      { name: 'open', section: '2', description: 'access files', options: [] },
      { name: 'groff_man', section: '7', description: 'format macros', options: [] },
      { name: 'tar', section: '1', description: 'archive files', options: [
        { flags: '-x, --extract', anchorId: 'extract' }, gzip,
        { flags: '-f, --file', anchorId: 'file', argument: 'ARCHIVE' },
      ] },
      { name: 'ss', section: '8', description: 'inspect sockets', options:
        [...'tlnp'].map(letter => ({ flags: `-${letter}`, anchorId: letter })) },
      ...Array.from({ length: 21 }, (_, i) => ({ name: `gzip${i}`, section: '1', description: 'compress streams', options: [gzip] })),
      // Fill all four typo buckets, including duplicate reads across prefixes.
      ...['grz', 'rgz', 'gpz'].flatMap(prefix => Array.from({ length: prefix === 'grz' ? 15 : 16 }, (_, i) =>
        ({ name: `${prefix}${String(i).padStart(2, '0')}`, section: '1', description: 'fixture utility', options: [] }))),
      // Five distinct prefixes require the shared 64-row ceiling to skip bucket five.
      ...['systemd.serzz', 'sybucket', 'ysbucket', 'ssbucket'].flatMap(prefix =>
        Array.from({ length: prefix === 'systemd.serzz' ? 15 : 16 }, (_, i) =>
          ({ name: `${prefix}${String(i).padStart(2, '0')}`, section: '5', description: 'fixture utility', options: [] }))),
    ]
    for (const { name, section, description, options } of specs) {
      const pageId = await ctx.db.insert('manPages', {
        releaseId, datasetReleaseId, externalId: `debian-${name}-${section}`, locale: 'en', distro: 'debian',
        name, section, sitemapPage: 1, title: `${name}(${section})`, description,
        sourcePath: `/fixture/${name}.${section}`, contentSha256: `fixture-${name}`, hasParseWarnings: false,
      })
      await ctx.db.insert('manPageSearchDocuments', {
        pageId, releaseId, datasetReleaseId, name, nameNorm: name, section, title: `${name}(${section})`,
        description, descNorm: description, searchText: `${name} ${description}`, snippetText: description,
      })
      for (const row of optionFlagRows(options)) await ctx.db.insert('manPageOptionFlags', {
        releaseId, pageId, nameNorm: name, section, ...row,
      })
    }
    await ctx.db.insert('manPageAliases', {
      releaseId, datasetReleaseId, name: 'man', section: '7', targetName: 'groff_man', targetSection: '7',
    })
    await ctx.db.patch(releaseId, { pageCount: 32 + specs.length, aliasCount: 1 })
    for (const section of ['1', '2', '5', '7', '8']) {
      const total = specs.filter(page => page.section === section).length
      const stat = await ctx.db.query('releaseSectionStats').withIndex('by_releaseId_and_section', q =>
        q.eq('releaseId', releaseId).eq('section', section)).unique()
      if (stat) await ctx.db.patch(stat._id, { total: stat.total + total })
      else await ctx.db.insert('releaseSectionStats', { releaseId, datasetReleaseId, section, label: `Section ${section}`, total })
    }
  })
  return t
}
