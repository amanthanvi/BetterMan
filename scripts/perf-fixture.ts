/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import schema from '../convex/schema'
import { internal } from '../convex/_generated/api'
import { persistOptionSignature } from '../convex/_derivedInputs'
import { serializeStoredPayload } from '../convex/_storedPayload'
import { syncFlagCandidates } from '../convex/_flagSearch'
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
        ingestedAt: '2026-10-26T00:00:00Z', pageCount: 32, sealed: true, manifestVerified: true,
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
        await persistOptionSignature(ctx, pageId, [], 1)
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
      if (distro === 'debian') {
        // One generated-layer row per content hash; every distro's bash shares it.
        await ctx.db.insert('manPageGenerated', {
          contentSha256: 'fixture-bash', updatedAt: '2026-10-28T00:00:00Z',
          page: { examples: [{ description: '', command: 'if [ -n "$1" ]; then\n  printf "%s\\n" "$1"\nfi' }], flagUsage: [] },
          tldr: {
            commit: 'f4566462f5996e13a4f3523f21dc2a863aec53c1', path: 'common/bash.md', rejected: 0,
            examples: [
              { description: 'Execute a command and then exit', command: 'bash -c "command"', placeholders: [[9, 16]] },
              { description: 'Execute a script', command: 'bash path/to/script.sh', placeholders: [[5, 22]] },
            ],
            flagUsage: [{ flag: '-c', count: 1 }],
          },
          generated: {
            provider: 'opencode-go', model: 'deepseek-v4.1-flash', promptVersion: 'b6-v1', generatedAt: '2026-10-28',
            summary: 'Runs an interactive shell or executes commands from a script or string.',
            examples: [{ description: 'Check a script for syntax errors without running it', command: 'bash -n path/to/script.sh' }],
            taskPhrases: ['run a shell script', 'check script syntax', 'start a login shell'],
            rejected: 0,
          },
        })
      }
      await ctx.db.insert('manPageLinks', {
        releaseId, fromPageId: pages[0].pageId, fromExternalId: `${distro}-bash`,
        toName: pages[1].name, toSection: '1', toExternalId: `${distro}-${pages[1].name}`,
        toTitle: `${pages[1].name}(1)`, toDescription: pages[1].description, linkType: 'see_also',
      })
    }
  })
  await t.mutation(internal.derived.rebuildActive, {})
  await t.finishAllScheduledFunctions(() => new Promise(resolve => setTimeout(resolve, 0)))
  const status = await t.query(internal.derived.status, {})
  if (!status.healthy) throw new Error('Performance fixture must publish a ready derived snapshot')
  return t
}

// The same seven-distro browser corpus, plus cached package choices on bash(1).
export async function createProviderFixture(onCall: () => void) {
  const t = await createFixture(onCall)
  await t.run(async ctx => {
    const active = (await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro', q =>
      q.eq('stage', 'prod').eq('locale', 'en').eq('distro', 'debian')).unique())!
    const page = (await ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q =>
      q.eq('releaseId', active.releaseId).eq('name', 'bash').eq('section', '1')).unique())!
    await ctx.db.patch(active.releaseId, { providerCount: 2 })
    await ctx.db.patch(page._id, { sourcePackage: 'bash', providerPackages: ['alternate-shell', 'bash', 'same-shell'] })
    const content = (await ctx.db.query('manPageContents').withIndex('by_pageId', q => q.eq('pageId', page._id)).unique())!
    const blob = (await ctx.db.get(content.blobId!))!
    for (const [pkg, hash] of [['alternate-shell', 'alternate-bash'], ['same-shell', page.contentSha256]]) {
      let blobId = blob._id
      if (hash !== page.contentSha256) {
        const payload = JSON.parse(await (await ctx.storage.get(blob.storageId!))!.text())
        const doc = JSON.parse(payload.content.docJson)
        doc.blocks.push({ type: 'paragraph', inlines: [{ type: 'text', text: 'Alternate shell provider documentation.' }] })
        const storageId = await ctx.storage.store(new Blob([serializeStoredPayload(hash, { ...payload.content, docJson: JSON.stringify(doc) })]))
        blobId = await ctx.db.insert('manPageContentBlobs', { contentSha256: hash, storageId })
      }
      await ctx.db.insert('manPageProviders', { releaseId: active.releaseId, datasetReleaseId: active.datasetReleaseId,
        externalId: pkg, name: 'bash', section: '1', title: page.title, description: page.description,
        sourcePath: `/fixture/${pkg}/bash.1`, sourcePackage: pkg, contentSha256: hash, hasParseWarnings: false, blobId })
    }
  })
  return t
}

// Translated releases (#395) beside the unchanged corpus: German has bash(1),
// French has a release without it, so `?lang=fr` measures the English fallback.
export async function createTranslationFixture(onCall: () => void) {
  const t = await createFixture(onCall)
  await t.run(async ctx => {
    const english = (await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro', q =>
      q.eq('stage', 'prod').eq('locale', 'en').eq('distro', 'debian')).unique())!
    const englishBash = (await ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q =>
      q.eq('releaseId', english.releaseId).eq('name', 'bash').eq('section', '1')).unique())!
    const content = (await ctx.db.query('manPageContents').withIndex('by_pageId', q => q.eq('pageId', englishBash._id)).unique())!
    const blob = (await ctx.db.get(content.blobId!))!
    const payload = JSON.parse(await (await ctx.storage.get(blob.storageId!))!.text())
    for (const [locale, name] of [['de', 'bash'], ['fr', 'tar01']] as const) {
      const datasetReleaseId = `2026-10-30+perf-v1-debian-${locale}`
      const releaseId = await ctx.db.insert('datasetReleases', {
        datasetReleaseId, distro: 'debian', locale, imageRef: 'fixture', imageDigest: 'fixture',
        ingestedAt: '2026-10-30T00:00:00Z', pageCount: 1, sealed: true, manifestVerified: true,
      })
      await ctx.db.insert('activeReleases', { stage: 'prod', locale, distro: 'debian', releaseId, datasetReleaseId, activatedAt: '2026-10-30T00:00:00Z' })
      const contentSha256 = `fixture-${locale}-${name}`
      const doc = JSON.parse(payload.content.docJson)
      doc.blocks.unshift({ type: 'paragraph', inlines: [{ type: 'text', text: `Übersetzte Handbuchseite (${locale}).` }] })
      const storageId = await ctx.storage.store(new Blob([serializeStoredPayload(contentSha256, { ...payload.content, docJson: JSON.stringify(doc) })]))
      const pageId = await ctx.db.insert('manPages', {
        releaseId, datasetReleaseId, externalId: `debian-${locale}-${name}`, locale, distro: 'debian', name, section: '1', sitemapPage: 1,
        title: `${name}(1)`, description: 'GNU Bourne-Again SHell (übersetzt)', sourcePath: `/fixture/${locale}/${name}.1`,
        sourcePackage: `manpages-${locale}`, sourcePackageVersion: '4.27.0-1', contentSha256, hasParseWarnings: false, documentedVersion: 'GNU bash 5.2',
      })
      const blobId = await ctx.db.insert('manPageContentBlobs', { contentSha256, storageId })
      await ctx.db.insert('manPageContents', { pageId, blobId, contentSha256 })
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

// Supplemental response-only cases exercise nonempty and pathological portability,
// without changing the browser's long-document/HTML baseline.
export async function createDerivedResponseFixture(onCall: () => void) {
  const t = convexTest(schema, instrumentModules(import.meta.glob('../convex/**/*.ts'), onCall))
  const { readFile } = await import('node:fs/promises')
  const tar = JSON.parse(await readFile('ingestion/tests/fixtures/golden/tar.1.json', 'utf8'))
  const largeOptions = Array.from({ length: 3009 }, (_, i) => ({ flags: `--flag-${i}`, anchorId: `flag-${i}`, argument: i % 2 ? 'VALUE' : null, description: `Documented option ${i}.` }))
  await t.run(async ctx => {
    for (const distro of ['debian', 'ubuntu', 'fedora', 'arch', 'alpine', 'freebsd', 'macos'] as const) {
      const datasetReleaseId = `derived-response-${distro}`
      const releaseId = await ctx.db.insert('datasetReleases', { datasetReleaseId, distro, locale: 'en', imageRef: 'fixture', imageDigest: 'fixture', ingestedAt: '2026-10-28T00:00:00Z', pageCount: 2, sealed: true, manifestVerified: true })
      await ctx.db.insert('activeReleases', { stage: 'prod', locale: 'en', distro, releaseId, datasetReleaseId, activatedAt: '2026-10-28T00:00:00Z' })
      for (const [name, options, doc] of [['tar', tar.options, tar.doc], ['large', largeOptions, { toc: [], blocks: [] }]] as const) {
        const pageId = await ctx.db.insert('manPages', { releaseId, datasetReleaseId, externalId: `${distro}-${name}`, locale: 'en', distro, name, section: '1', sitemapPage: 0, title: name, description: 'response fixture', sourcePath: name, contentSha256: name, hasParseWarnings: false })
        const storageId = await ctx.storage.store(new Blob([serializeStoredPayload(name, { docJson: JSON.stringify(doc), optionsJson: JSON.stringify(options) })]))
        await ctx.db.insert('manPageContents', { pageId, storageId })
        await persistOptionSignature(ctx, pageId, options, 1)
      }
    }
  })
  await t.mutation(internal.derived.rebuildActive, {})
  await t.finishAllScheduledFunctions(() => new Promise(resolve => setTimeout(resolve, 0)))
  const status = await t.query(internal.derived.status, {})
  if (!status.healthy) throw new Error('Response fixture must publish every derived summary')
  return t
}

// Isolated B5 fixtures do not change earlier browser/search budget workloads.
export async function createExplainFixture(onCall: () => void) {
  const t = await createSearchFixture(onCall)
  await t.run(async ctx => {
    const active = await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro', q => q.eq('stage', 'prod').eq('locale', 'en').eq('distro', 'debian')).unique()
    const { releaseId, datasetReleaseId } = active!
    const specs = [
      { name: 'find', section: '1', options: [{ flags: '-name', anchorId: 'name', argument: 'PATTERN' }, { flags: '-mtime', anchorId: 'mtime', argument: 'N' }, { flags: '-print0', anchorId: 'print0' }, {flags:'-exec',anchorId:'exec',argument:'COMMAND'}] },
      { name: 'xargs', section: '1', options: [{ flags: '-0', anchorId: 'null' },{flags:'-I',anchorId:'replace',argument:'REPLACE'},{flags:'--max-lines',anchorId:'max-lines',argument:'[N]'},{flags:'-d, --delimiter',anchorId:'delimiter',argument:'CHAR'}] },
      { name: 'rm', section: '1', options: [{ flags: '-f, --force', anchorId: 'force' },{flags:'-r, --recursive',anchorId:'recursive'},{flags:'--interactive',anchorId:'interactive',argument:'[WHEN]'}] },
      { name: 'truncate', section: '1', options: [{flags:'-s, --size',anchorId:'size',argument:'SIZE'}] },
      {name:'echo',section:'1',options:[]},
      {name:'sudo',section:'1',options:[{flags:'-u',anchorId:'user',argument:'USER'}]},
      {name:'env',section:'1',options:[]}, {name:'timeout',section:'1',options:[]},
      { name: 'git', section: '1', options: [] },
      { name: 'git-commit', section: '1', options: [{ flags: '-m', anchorId: 'message', argument: 'MESSAGE' }] },
      { name: 'systemctl', section: '1', options: [] },
      { name: 'mke2fs', section: '8', options: [] },
      { name: 'ssh_config', section: '5', options: [] },
      { name: 'bounded', section: '1', options: Array.from({ length: 100 }, (_, i) => ({ flags: `--limit${i}`, anchorId: `limit${i}` })) },
    ]
    for (const spec of specs) {
      const pageId = await ctx.db.insert('manPages', { releaseId, datasetReleaseId, externalId: `b5-${spec.name}`, locale: 'en', distro: 'debian', name: spec.name, section: spec.section, sitemapPage: 1, title: `${spec.name}(${spec.section})`, description: `Manual for ${spec.name}`, sourcePath: spec.name, contentSha256: spec.name, hasParseWarnings: false })
      for (const row of optionFlagRows(spec.options)) await ctx.db.insert('manPageOptionFlags', { ...row, releaseId, pageId, nameNorm: spec.name, section: spec.section })
      if (spec.name === 'ssh_config') {
        for (let i = 0; i < 12; i++) {
          const name = i ? `ssh_config${i}` : 'ssh_config'
          const targetId = i ? await ctx.db.insert('manPages', { releaseId, datasetReleaseId, externalId: `b5-${name}`, locale: 'en', distro: 'debian', name, section: '5', sitemapPage: 1, title: `${name}(5)`, description: 'Client configuration', sourcePath: name, contentSha256: name, hasParseWarnings: false }) : pageId
          await ctx.db.insert('manPageSymbols', { releaseId, pageId: targetId, name, section: '5', title: `${name}(5)`, description: 'Client configuration', term: 'ForwardAgent', termNorm: 'forwardagent', anchorId: 'ForwardAgent', excerpt: 'Forward authentication agent connections.', kind: 'config' })
        }
      }
      if (spec.name === 'systemctl') await ctx.db.insert('manPageSymbols',{releaseId,pageId,name:'systemctl',section:'1',title:'systemctl(1)',description:'Control the system manager',term:'systemctl restart',termNorm:'systemctl restart',anchorId:'unit-commands-introspection-and-modification',excerpt:'Stop and then start one or more units specified on the command line.',kind:'subcommand'})
      if (spec.name === 'mke2fs') await ctx.db.insert('manPageAliases',{releaseId,datasetReleaseId,name:'mkfs.ext4',section:'8',targetName:'mke2fs',targetSection:'8'})
      if (spec.name === 'git-commit') await ctx.db.insert('manPageSymbols', { releaseId, pageId, name: spec.name, section: '1', title: 'git-commit(1)', description: 'Commit changes', term: 'git commit', termNorm: 'git commit', anchorId: '', excerpt: 'Commit changes', kind: 'subcommand' })
    }
    const tar = await ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId', releaseId).eq('name', 'tar').eq('section', '1')).unique()
    for (const row of optionFlagRows([{ flags: '-v, --verbose', anchorId: 'verbose' }, { flags: '-C, --directory', anchorId: 'directory', argument: 'DIR' }])) await ctx.db.insert('manPageOptionFlags', { ...row, releaseId, pageId: tar!._id, nameNorm: 'tar', section: '1' })
    const bash = await ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId', releaseId).eq('name', 'bash').eq('section', '1')).unique()
    for (const kind of ['pipeline', 'quoting', 'glob', 'substitution', 'list', 'redirect', 'subshell', 'assignment', 'expansion']) await ctx.db.insert('manPageSymbols', { releaseId, pageId: bash!._id, name: 'bash', section: '1', title: 'bash(1)', description: 'Shell syntax', term: `shell:${kind}`, termNorm: `shell:${kind}`, anchorId: `shell-${kind}`, excerpt: `Shell ${kind}`, kind: 'shell' })
  })
  return t
}

// Independent saturated corpus: widening page/symbol ranges changes the resolved
// stage count even if the request-wide allowance stops the next lookup earlier.
export async function createExplainMultiFixture(onCall: () => void) {
  const t = await createExplainFixture(onCall)
  await t.run(async ctx => {
    const active = await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro', q=>q.eq('stage','prod').eq('locale','en').eq('distro','debian')).unique()
    const git = (await ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q=>q.eq('releaseId',active!.releaseId).eq('name','git')).first())!
    const {_id,_creationTime,...fields} = git
    void _id; void _creationTime
    for (const section of ['1ssl','3','8']) await ctx.db.insert('manPages',{...fields,section,externalId:`git-${section}`})
    for (const verb of 'abcdefghijklmnopqrstuvwx') {
      for (let i=0;i<5;i++) {
        const name=`git-${verb}${i || ''}`
        const pageId=await ctx.db.insert('manPages',{...fields,name,externalId:name})
        await ctx.db.insert('manPageSymbols',{releaseId:git.releaseId,pageId,name,section:'1',title:`${name}(1)`,description:'Saturated subcommand',term:`git ${verb}`,termNorm:`git ${verb}`,anchorId:'',excerpt:'Subcommand',kind:'subcommand'})
      }
    }
    const bash=(await ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section',q=>q.eq('releaseId',git.releaseId).eq('name','bash')).first())!
    for(let i=0;i<4;i++) await ctx.db.insert('manPageSymbols',{releaseId:git.releaseId,pageId:bash._id,name:'bash',section:'1',title:'bash(1)',description:'Syntax',term:'shell:pipeline',termNorm:'shell:pipeline',anchorId:`pipeline${i}`,excerpt:'Pipeline',kind:'shell'})
  })
  return t
}

// Worst-case bare-cluster workload: nine covering candidates, crowded -x, and all 12 brief lookups.
export async function createBareSearchFixture(onCall: () => void) {
  const t = await createSearchFixture(onCall)
  await t.run(async ctx => {
    const active = await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro', q => q.eq('stage', 'prod').eq('locale', 'en').eq('distro', 'debian')).unique()
    const { releaseId } = active!
    await ctx.db.patch(releaseId, { flagSearchReady: true })
    const tar = await ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId', releaseId).eq('name', 'tar')).unique()
    const extra = Array.from({ length: 9 }, (_, i) => `--fixture-${i}`)
    for (const flag of extra) await ctx.db.insert('manPageOptionFlags', { releaseId, pageId: tar!._id, nameNorm: 'tar', section: '1', flag, flags: flag, anchorId: flag.slice(2) })
    const verifiedFlagUsage = ['-x', '-z', '-f', ...extra].map(flag => ({ flag, count: flag.length === 2 ? 10 : 1, source: 'tldr' as const }))
    await ctx.db.patch(tar!._id, { popularityScore: 5470, verifiedFlagUsage })
    await syncFlagCandidates(ctx, { ...tar!, popularityScore: 5470, verifiedFlagUsage })
    for (let i = 0; i < 8; i++) {
      const name = `covering-${i}`
      const pageId = await ctx.db.insert('manPages', { releaseId, datasetReleaseId: tar!.datasetReleaseId, externalId: name,
        locale: 'en', distro: 'debian', name, section: '1', sitemapPage: 1, title: name, description: name,
        sourcePath: name, contentSha256: name, hasParseWarnings: false, popularityScore: 5470,
        verifiedFlagUsage: ['-x', '-z', '-f'].map(flag => ({ flag, count: 1, source: 'tldr' as const })) })
      for (const row of optionFlagRows([{ flags: '-x', anchorId: 'x' }, { flags: '-z', anchorId: 'z' }, { flags: '-f', anchorId: 'f', argument: 'FILE' }])) {
        await ctx.db.insert('manPageOptionFlags', { releaseId, pageId, nameNorm: name, section: '1', ...row })
      }
      await syncFlagCandidates(ctx, (await ctx.db.get(pageId))!)
    }
    const grep = await ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId', releaseId).eq('name', 'grep')).unique()
    for (const flag of ['-x', '-z', '-f']) await ctx.db.insert('manPageOptionFlags', { releaseId, pageId: grep!._id, nameNorm: 'grep', section: '1', flag, flags: flag, anchorId: flag.slice(1), ...(flag === '-f' ? { takesArgument: true } : {}) })
    await ctx.db.patch(grep!._id, { popularityScore: 5470 })
    for (let i = 0; i < 6; i++) {
      const name = `a-crowded-${i}`
      const pageId = await ctx.db.insert('manPages', { releaseId, datasetReleaseId: grep!.datasetReleaseId,
        externalId: name, locale: 'en', distro: 'debian', name, section: '1', sitemapPage: 1, title: name, description: name, sourcePath: name, contentSha256: name, hasParseWarnings: false, popularityScore: 5470 })
      await ctx.db.insert('manPageOptionFlags', { releaseId, pageId, nameNorm: name, section: '1', flag: '-x', flags: '-x', anchorId: 'x' })
    }
  })
  return t
}
