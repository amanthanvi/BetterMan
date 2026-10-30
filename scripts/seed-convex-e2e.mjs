import crypto from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'

const stage = process.env.BETTERMAN_DATASET_STAGE || 'prod'
const secret = process.env.CONVEX_INGEST_SECRET
const rawUrl = process.env.CONVEX_HTTP_URL || process.env.CONVEX_SITE_URL || process.env.CONVEX_URL

if (process.env.BETTERMAN_E2E_SEED !== '1') {
  throw new Error('Refusing to seed Convex without BETTERMAN_E2E_SEED=1')
}
if (!secret) throw new Error('CONVEX_INGEST_SECRET is required')
if (!rawUrl) throw new Error('CONVEX_HTTP_URL, CONVEX_SITE_URL, or CONVEX_URL is required')

function httpUrl(value) {
  const trimmed = value.trim().replace(/\/$/, '')
  if (trimmed.endsWith('.convex.cloud')) return `${trimmed.slice(0, -'.convex.cloud'.length)}.convex.site`
  return trimmed
}

const baseUrl = httpUrl(rawUrl)

async function post(path, payload) {
  const res = await fetch(`${baseUrl}/${path.replace(/^\//, '')}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (res.status === 409 && path === '/ingest/activate') {
    const result = await res.json()
    if (result.pending === true) return result
    throw new Error('Seed activation conflict without pending status')
  }
  if (!res.ok) throw new Error(`Convex seed ${path} failed: ${res.status} ${await res.text()}`)
  return await res.json()
}

function stableSha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function page({
  name, section, title, description, toc, blocks, synopsis = null, options = null, seeAlso = null,
  sourcePackage = null, sourcePackageVersion = null,
}) {
  const doc = { toc, blocks }
  const plainText = [name, description, JSON.stringify(doc)].join(' ')
  return {
    externalId: crypto.randomUUID(),
    name,
    section,
    sitemapPage: 1,
    title,
    description,
    sourcePath: `/e2e/${name}.${section}`,
    sourcePackage,
    sourcePackageVersion,
    contentSha256: stableSha(doc),
    hasParseWarnings: false,
    doc,
    synopsis,
    options,
    seeAlso,
    searchText: plainText,
    snippetText: plainText,
    links: [],
  }
}

function makePages(distro) {
  const gzip = page({
    name: 'gzip',
    section: '1',
    title: 'gzip(1)',
    description: 'compress or expand files',
    toc: [{ id: 'description', title: 'DESCRIPTION', level: 2 }],
    blocks: [
      { type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' },
      { type: 'paragraph', inlines: [{ type: 'text', text: 'gzip reduces file size using LZ77 compression.' }] },
    ],
    synopsis: ['gzip [OPTION]... [FILE]...'],
  })

  const tarOptAnchor = 'opt-create'
  const tarBlocks = [
    { type: 'heading', id: 'synopsis', level: 2, text: 'SYNOPSIS' },
    { type: 'code_block', id: 'synopsis-code', text: 'tar [OPTION]... [FILE]...\n\ntar -cf archive.tar dir/', languageHint: 'bash' },
    { type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' },
    {
      type: 'paragraph',
      inlines: [
        { type: 'text', text: 'tar creates and extracts archives.' },
        { type: 'text', text: ' Use it to bundle directories into a single file. tarr is a common typo.' },
      ],
    },
    {
      type: 'paragraph',
      inlines: [
        { type: 'text', text: 'Run it from ' },
        { type: 'link', href: '/man/bash/1', linkType: 'internal', inlines: [{ type: 'text', text: 'bash(1)' }] },
        { type: 'text', text: '. Non-compressed input and --catalog are unrelated to -c. Report bugs at https://www.gnu.org/software/tar/.' },
      ],
    },
  ]

  const variantLabel = { ubuntu: 'Ubuntu', freebsd: 'FreeBSD', macos: 'macOS' }[distro]
  if (variantLabel) {
    tarBlocks.push({
      type: 'paragraph',
      inlines: [{ type: 'text', text: `${variantLabel} variant: this page is intentionally different for E2E testing.` }],
    })
  }

  tarBlocks.push(
    { type: 'heading', id: 'options', level: 2, text: 'OPTIONS' },
    {
      type: 'definition_list',
      items: [
        {
          id: tarOptAnchor,
          termInlines: [{ type: 'code', text: '-c, --create' }],
          definitionBlocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Create a new archive.' }] }],
        },
      ],
    },
    { type: 'heading', id: 'examples', level: 2, text: 'EXAMPLES' },
    { type: 'code_block', id: 'example-1', text: 'tar -cf archive.tar ./my-folder\n\ntar -xf archive.tar', languageHint: 'bash' },
    { type: 'heading', id: 'see-also', level: 2, text: 'SEE ALSO' },
    {
      type: 'paragraph',
      inlines: [
        { type: 'link', href: '/man/gzip/1', linkType: 'internal', inlines: [{ type: 'text', text: 'gzip(1)' }] },
        { type: 'text', text: ' and cpio(1).' },
      ],
    },
  )

  const tar = page({
    name: 'tar',
    section: '1',
    title: 'tar(1)',
    description: distro === 'freebsd' || distro === 'macos' ? `an archiving utility (${variantLabel} variant)` : 'an archiving utility',
    toc: [
      { id: 'synopsis', title: 'SYNOPSIS', level: 2 },
      { id: 'description', title: 'DESCRIPTION', level: 2 },
      { id: 'options', title: 'OPTIONS', level: 2 },
      { id: 'examples', title: 'EXAMPLES', level: 2 },
      { id: 'see-also', title: 'SEE ALSO', level: 2 },
    ],
    blocks: tarBlocks,
    synopsis: ['tar [OPTION]... [FILE]...'],
    options: [{ flags: '-c, --create', argument: null, description: 'Create a new archive.', anchorId: tarOptAnchor }],
    seeAlso: [{ name: 'gzip', section: '1', resolvedPageId: gzip.externalId }, { name: 'cpio', section: '1', resolvedPageId: null }],
    sourcePackage: 'tar',
    sourcePackageVersion: '1.35+dfsg-3',
  })
  tar.links.push({ toExternalId: gzip.externalId, toName: 'gzip', toSection: '1', linkType: 'see_also' })
  // The SEE ALSO paragraph links gzip(1) again, as ingestion records it.
  tar.links.push({ toExternalId: gzip.externalId, toName: 'gzip', toSection: '1', linkType: 'xref' })

  const printf1 = page({
    name: 'printf',
    section: '1',
    title: 'printf(1)',
    description: 'format and print data',
    toc: [{ id: 'description', title: 'DESCRIPTION', level: 2 }],
    blocks: [{ type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' }, { type: 'paragraph', inlines: [{ type: 'text', text: 'printf formats and prints data.' }] }],
  })

  const printf3 = page({
    name: 'printf',
    section: '3',
    title: 'printf(3)',
    description: 'formatted output conversion',
    toc: [{ id: 'description', title: 'DESCRIPTION', level: 2 }],
    blocks: [
      { type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' },
      { type: 'paragraph', inlines: [{ type: 'text', text: 'printf() writes formatted output to stdout.' }] },
      { type: 'code_block', id: 'description-code', text: 'int printf(const char *restrict format, ...);', languageHint: null },
    ],
  })

  const openssl = page({
    name: 'openssl',
    section: '1ssl',
    title: 'openssl(1ssl)',
    description: 'OpenSSL command line tool',
    toc: [{ id: 'description', title: 'DESCRIPTION', level: 2 }],
    blocks: [{ type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' }, { type: 'paragraph', inlines: [{ type: 'text', text: 'OpenSSL is a cryptography toolkit.' }] }],
  })

  const evp = page({
    name: 'evp_digestinit',
    section: '3ssl',
    title: 'EVP_DigestInit(3ssl)',
    description: 'initialize a digest context',
    toc: [{ id: 'description', title: 'DESCRIPTION', level: 2 }],
    blocks: [{ type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' }, { type: 'paragraph', inlines: [{ type: 'text', text: 'EVP_DigestInit() initializes a digest context.' }] }],
  })

  const bashBlocks = [{ type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' }]
  for (let i = 0; i < 120; i += 1) {
    bashBlocks.push({ type: 'paragraph', inlines: [{ type: 'text', text: `Filler block ${i + 1} for bash(1) long-page tests.` }] })
  }
  // Code blocks above BUGS give late layout shifts something to move after a
  // deep link has already scrolled to it.
  const bashSample = Array.from({ length: 14 }, (_, i) =>
    i % 3 === 0 ? `# step ${i + 1}: check the input` : `if [ -n "$1" ]; then echo "run ${i + 1}"; fi`,
  ).join('\n')
  bashBlocks.push({ type: 'heading', id: 'notes', level: 2, text: 'NOTES' })
  for (let i = 0; i < 5; i += 1) {
    bashBlocks.push({ type: 'code_block', id: `notes-code-${i + 1}`, text: bashSample, languageHint: 'bash' })
  }
  bashBlocks.push({ type: 'heading', id: 'bugs', level: 2, text: 'BUGS' })
  for (let i = 0; i < 30; i += 1) {
    bashBlocks.push({ type: 'paragraph', inlines: [{ type: 'text', text: `Known issue ${i + 1}.` }] })
  }
  const bash = page({
    name: 'bash',
    section: '1',
    title: 'bash(1)',
    description: 'GNU Bourne-Again SHell',
    toc: [
      { id: 'description', title: 'DESCRIPTION', level: 2 },
      { id: 'notes', title: 'NOTES', level: 2 },
      { id: 'bugs', title: 'BUGS', level: 2 },
    ],
    blocks: bashBlocks,
    synopsis: ['bash [options] [command_string | file]'],
  })

  tar.links.push({ toExternalId: bash.externalId, toName: 'bash', toSection: '1', linkType: 'xref' })

  const perl = page({
    name: 'foo::bar', section: '3pm', title: 'foo::bar(3pm)', description: 'Perl module route fixture',
    toc: [], blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Perl module documentation.' }] }],
  })
  const pages = [gzip, tar, printf1, printf3, openssl, evp, bash, perl]
  // Linux only, so FreeBSD and macOS have a page another distro carries.
  if (distro !== 'freebsd' && distro !== 'macos') {
    pages.push(
      page({
        name: 'systemctl',
        section: '1',
        title: 'systemctl(1)',
        description: 'Control the systemd system and service manager',
        toc: [{ id: 'description', title: 'DESCRIPTION', level: 2 }],
        blocks: [
          { type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' },
          { type: 'paragraph', inlines: [{ type: 'text', text: 'systemctl inspects and controls systemd.' }] },
        ],
        synopsis: ['systemctl [OPTIONS...] COMMAND [UNIT...]'],
      }),
    )
  }
  return pages
}

const now = new Date().toISOString()
for (const distro of ['debian', 'ubuntu', 'fedora', 'freebsd', 'macos']) {
  const pages = makePages(distro)
  pages.push(page({ name: 'tnftp', section: '1', title: 'tnftp(1)', description: 'Terminal FTP fixture',
    sourcePackage: 'tnftp', toc: [], blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Terminal FTP documentation.' }] }],
  }))
  if (distro === 'debian' || distro === 'freebsd' || distro === 'macos') {
    // ls(1) for the options index: ten options, two of them GNU-only, so portability differs.
    const flags = [
      ['-a', 'all', 'Do not ignore entries starting with a dot.'],
      ['-l', 'long', 'Use a long listing format.'],
      ['-h', 'human', 'Print sizes in human-readable form.'],
      ['-R', 'recursive', 'List subdirectories recursively.'],
      ['-t', 'time', 'Sort by modification time, newest first.'],
      ['-S', 'size', 'Sort by file size, largest first.'],
      ['-r', 'reverse', 'Reverse the order while sorting.'],
      ['-w', 'width', 'Set the output width to COLS.', 'COLS'],
      ...(distro === 'debian' ? [
        ['--color', 'color', 'Colorize the output.', '[=WHEN]'],
        ['--group-directories-first', 'group-directories-first', 'Group directories before files.'],
      ] : []),
    ]
    const items = flags.map(([flag, id, description, argument]) => ({ id: `opt-${id}`, termInlines: [{ type: 'code', text: flag }, ...(argument ? [{ type: 'text', text: ` ${argument}` }] : [])], definitionBlocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: description }] }] }))
    pages.push(page({
      name: 'ls', section: '1', title: 'ls(1)', description: 'list directory contents', sourcePackage: 'coreutils',
      toc: [{ id: 'description', title: 'DESCRIPTION', level: 2 }, { id: 'options', title: 'OPTIONS', level: 2 }],
      blocks: [
        { type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' },
        { type: 'paragraph', inlines: [{ type: 'text', text: 'List information about the files.' }] },
        { type: 'heading', id: 'options', level: 2, text: 'OPTIONS' },
        { type: 'definition_list', items },
      ],
      options: flags.map(([flag, id, description, argument]) => ({ flags: flag, anchorId: `opt-${id}`, description, ...(argument ? { argument } : {}) })),
    }))
  }
  // ascii(7): a reference table for the man page's row lookup and column sort.
  const asciiRows = [['060', '48', '30', '0'], ['061', '49', '31', '1'], ['062', '50', '32', '2'], ['101', '65', '41', 'A'], ['102', '66', '42', 'B'], ['103', '67', '43', 'C'], ['141', '97', '61', 'a'], ['142', '98', '62', 'b'], ['143', '99', '63', 'c'], ['040', '32', '20', 'SPACE']]
  pages.push(page({
    name: 'ascii', section: '7', title: 'ascii(7)', description: 'ASCII character set encoded in octal, decimal, and hexadecimal',
    toc: [{ id: 'description', title: 'DESCRIPTION', level: 2 }],
    blocks: [
      { type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' },
      { type: 'paragraph', inlines: [{ type: 'text', text: 'ASCII is the American Standard Code for Information Interchange.' }] },
      { type: 'table', headers: ['Oct', 'Dec', 'Hex', 'Char'], rows: asciiRows },
    ],
  }))
  const datasetReleaseId = `e2e-${distro}-${Date.now()}`
  const sectionTotals = Object.entries(
    pages.reduce((acc, p) => {
      acc[p.section] = (acc[p.section] || 0) + 1
      return acc
    }, {}),
  ).map(([section, total]) => ({ section, total }))

  await post('/ingest/release', {
    datasetReleaseId,
    locale: 'en',
    distro,
    imageRef: 'e2e',
    imageDigest: 'e2e',
    ingestedAt: now,
    packageManifest: { packages: [] },
    pageCount: pages.length,
    providerCount: 4,
    packageBatches: [],
    aliasCount: 3,
    licenseCount: 0,
    sectionTotals,
    licensePackages: [],
  })
  await post('/ingest/pages', { datasetReleaseId, pages })
  if (distro === 'debian') {
    // The generated layer (B6) for tar(1): a summary and sourced examples for the man page's In brief.
    const tar = pages.find((p) => p.name === 'tar')
    await post('/ingest/generated', { records: [{
      contentSha256: tar.contentSha256,
      page: { examples: [{ description: 'Create an archive from a folder', command: 'tar -cf archive.tar ./my-folder' }], flagUsage: [{ flag: '-c', count: 1 }] },
      tldr: {
        commit: 'f4566462f5996e13a4f3523f21dc2a863aec53c1', path: 'common/tar.md', rejected: 0,
        examples: [{ description: 'Create an archive and write it to a file', command: 'tar --create --file path/to/target.tar path/to/file', placeholders: [[20, 38], [39, 51]] }],
        flagUsage: [{ flag: '--create', count: 1 }],
      },
      generated: {
        provider: 'opencode-go', model: 'deepseek-v4.1-flash', promptVersion: 'b6-v1', generatedAt: '2026-10-28',
        summary: 'Creates and extracts archive files <b>such as</b> tarballs.',
        examples: [{ description: 'Create an archive of the current folder', command: 'tar -c .' }],
        taskPhrases: ['create a tar archive', 'bundle a folder'],
        rejected: 0,
      },
    }] })
  }
  await post('/ingest/pages/storage', { datasetReleaseId, pages: [{
    ...page({ name: 'foo::bar', section: '3pm', title: 'foo::bar(3pm)',
      description: 'Alternate package provider', sourcePackage: 'alternate-perl',
      toc: [], blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Alternate provider documentation.' }] }],
    }), providerOnly: true,
  }, {
    ...page({ name: 'ftp', section: '1', title: 'FTP(1)', description: 'GNUstep FTP fixture', sourcePackage: 'ftp.app',
      toc: [], blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'GNUstep FTP documentation.' }] }],
    }), sourcePath: '/e2e/FTP.1', providerOnly: true,
  }] })
  // `.so` stub: /man/gunzip/1 redirects to gzip(1).
  await post('/ingest/aliases', {
    datasetReleaseId,
    aliases: [
      { name: 'gunzip', section: '1', targetName: 'gzip', targetSection: '1' },
      { name: 'ftp', section: '1', targetName: 'tnftp', targetSection: '1', targetPackage: 'tnftp', sourcePackage: 'tnftp', sourcePath: '/e2e/tnftp.1', providerOnly: false },
      { name: 'foo::stub', section: '3pm', targetName: 'foo::bar', targetSection: '3pm', sourcePackage: 'stub-perl', sourcePath: 'man3/stub.3pm', targetPackage: 'alternate-perl', providerOnly: false },
    ],
  })
  const deadline = Date.now() + 300_000
  while (true) {
    const result = await post('/ingest/activate', { stage, datasetReleaseId, activatedAt: now })
    if (result.pending === false && result.datasetReleaseId === datasetReleaseId) break
    if (result.pending !== true) throw new Error('Invalid seed activation response')
    if (Date.now() >= deadline) throw new Error('Seed activation timed out waiting for hydration')
    await sleep(200)
  }
}
