import crypto from 'node:crypto'

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
  if (!res.ok) throw new Error(`Convex seed ${path} failed: ${res.status} ${await res.text()}`)
  return await res.json()
}

function stableSha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function page({ name, section, title, description, toc, blocks, synopsis = null, options = null, seeAlso = null }) {
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
    sourcePackage: null,
    sourcePackageVersion: null,
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
  ]

  if (distro === 'ubuntu') {
    tarBlocks.push({
      type: 'paragraph',
      inlines: [{ type: 'text', text: 'Ubuntu variant: this page is intentionally different for E2E testing.' }],
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
    description: 'an archiving utility',
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
  })
  tar.links.push({ toExternalId: gzip.externalId, toName: 'gzip', toSection: '1', linkType: 'see_also' })

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
    blocks: [{ type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' }, { type: 'paragraph', inlines: [{ type: 'text', text: 'printf() writes formatted output to stdout.' }] }],
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
    name: 'EVP_DigestInit',
    section: '3ssl',
    title: 'EVP_DigestInit(3ssl)',
    description: 'initialize a digest context',
    toc: [{ id: 'description', title: 'DESCRIPTION', level: 2 }],
    blocks: [{ type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' }, { type: 'paragraph', inlines: [{ type: 'text', text: 'EVP_DigestInit() initializes a digest context.' }] }],
  })

  const bashBlocks = [{ type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' }]
  for (let i = 0; i < 120; i += 1) {
    bashBlocks.push({ type: 'paragraph', inlines: [{ type: 'text', text: `Filler block ${i + 1} for bash(1) virtualization tests.` }] })
  }
  const bash = page({
    name: 'bash',
    section: '1',
    title: 'bash(1)',
    description: 'GNU Bourne-Again SHell',
    toc: [{ id: 'description', title: 'DESCRIPTION', level: 2 }],
    blocks: bashBlocks,
    synopsis: ['bash [options] [command_string | file]'],
  })

  return [gzip, tar, printf1, printf3, openssl, evp, bash]
}

const now = new Date().toISOString()
for (const distro of ['debian', 'ubuntu', 'fedora']) {
  const pages = makePages(distro)
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
    sectionTotals,
    licensePackages: [],
  })
  await post('/ingest/pages', { datasetReleaseId, pages })
  await post('/ingest/activate', { stage, datasetReleaseId, activatedAt: now })
}
