import { describe, expect, it } from 'vitest'

import { ogCard } from './card'

const PNG = '89504e470d0a1a0a'

async function png(input: Parameters<typeof ogCard>[0]) {
  const response = await ogCard(input)
  const body = Buffer.from(await response.arrayBuffer())
  return { type: response.headers.get('content-type'), magic: body.subarray(0, 8).toString('hex'), width: body.readUInt32BE(16), height: body.readUInt32BE(20) }
}

describe('share cards', () => {
  it.each([
    ['a page', { name: 'tar', section: '1', label: 'User Commands', description: 'an archiving utility', distro: 'Debian', date: 'Oct 28, 2026' }],
    ['a flag', { name: 'tar', section: '1', label: 'User Commands', option: { flags: '-x, --extract, --get', description: 'Extract files from an archive.' }, distro: 'Debian', date: 'Oct 28, 2026' }],
    ['a long title', { name: 'x'.repeat(200), section: '3pm', label: 'Library Functions', description: 'd'.repeat(500), distro: 'macOS (BSD-licensed subset)' }],
    ['a Cyrillic and Greek name', { name: 'пример-λ', section: '1', label: 'User Commands', description: '«пример» — ελληνικά' }],
    ['a generated summary', { name: 'xyz', section: '1', label: 'User Commands', generated: { text: 'Prints <b>xyz</b>.', label: 'generated · m-1, 2026-10-28' } }],
  ])('renders %s as a 1200×630 PNG with the static fonts', async (_name, input) => {
    expect(await png(input)).toEqual({ type: 'image/png', magic: PNG, width: 1200, height: 630 })
  })
})
