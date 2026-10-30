import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { Concept, ConceptBlock } from '../lib/concepts'
import { buildConcepts, OUTPUT_FILE, serialize } from './build-concepts.mjs'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const WORDS = Array.from({ length: 130 }, (_, i) => `word${i}`).join(' ')

function concept(slug: string, { front = '', body = WORDS }: { front?: string; body?: string } = {}) {
  return [
    '---',
    `slug: ${slug}`,
    'title: Example',
    'term: example',
    'summary: An example.',
    'status: pending-owner',
    'generated-by: test-model',
    'generated-on: 2026-10-30',
    'sources:',
    '  - page: signal(7)',
    '    package: manpages 6.9.1-1',
    '    distros: debian, ubuntu',
    '    sections: DESCRIPTION',
    front,
    '---',
    body,
    '',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function build(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bm-concepts-'))
  dirs.push(dir)
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text)
  return buildConcepts(dir)
}

describe('build-concepts', () => {
  it('keeps lib/concepts.generated.json in step with content/concepts', () => {
    expect(readFileSync(OUTPUT_FILE, 'utf8')).toBe(serialize(buildConcepts()))
  })

  it('publishes all twenty, each read by the model panel and skimmed by the owner', () => {
    // A change of status is a reviewed content change; update this list with it.
    const concepts = buildConcepts().concepts as Concept[]
    expect(concepts).toHaveLength(20)
    for (const concept of concepts) {
      expect(concept.status, concept.slug).toBe('approved')
      expect(concept.panelReview, concept.slug).toBe('GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied')
      expect(concept.ownerSkim, concept.slug).toBe('approved 2026-10-30')
    }
  })

  it('refuses approval without both reviews', () => {
    const approved = concept('example').replace('status: pending-owner', 'status: approved')
    expect(() => build({ 'example.md': approved })).toThrow('approved needs panel-review and owner-skim')
    expect(() => build({ 'example.md': approved.replace('generated-on: 2026-10-30', 'generated-on: 2026-10-30\npanel-review: panel') })).toThrow('owner-skim')
    expect(build({ 'example.md': approved.replace('generated-on: 2026-10-30', 'generated-on: 2026-10-30\npanel-review: panel\nowner-skim: approved') }).concepts[0].status).toBe('approved')
  })

  it('parses sources, citations, concept links, code spans, lists and fences into data', () => {
    const body = [
      `See kill(1) and \`kill(1)\`, the *default*, and [[other|the other one]]. ${WORDS}`,
      '',
      '- one',
      '  continued',
      '- two',
      '',
      '```',
      '<script>alert(1)</script>',
      '```',
    ].join('\n')
    const { concepts } = build({ 'example.md': concept('example', { body, front: 'aliases: Foo, bar\nreferences: signal(7)' }), 'other.md': concept('other') })
    const example = concepts[0] as unknown as Concept
    const paragraph = example.body[0] as Extract<ConceptBlock, { type: 'p' }>
    expect(example.sources).toEqual([{ page: { name: 'signal', section: '7' }, package: 'manpages 6.9.1-1', distros: ['debian', 'ubuntu'], sections: 'DESCRIPTION' }])
    expect(example.aliases).toEqual(['foo', 'bar'])
    expect(example.references).toEqual([{ name: 'signal', section: '7' }])
    expect(paragraph.inlines.slice(0, 6)).toEqual([
      { t: 'text', v: 'See ' },
      { t: 'man', name: 'kill', section: '1' },
      { t: 'text', v: ' and ' },
      { t: 'code', v: 'kill(1)' },
      { t: 'text', v: ', the ' },
      { t: 'em', v: 'default' },
    ])
    expect(paragraph.inlines).toContainEqual({ t: 'concept', slug: 'other', v: 'the other one' })
    expect(example.body[1]).toEqual({ type: 'ul', items: [[{ t: 'text', v: 'one continued' }], [{ t: 'text', v: 'two' }]] })
    expect(example.body[2]).toEqual({ type: 'pre', text: '<script>alert(1)</script>' })
  })

  it.each([
    ['a slug that is not the file name', concept('wrong'), 'must match the file name'],
    ['an unknown status', concept('example', { front: 'status: published' }), 'duplicate key status'],
    ['a link to a missing concept', concept('example', { body: `[[nowhere]] ${WORDS}` }), 'names no concept'],
    ['a body that is too short', concept('example', { body: 'Too short.' }), 'keep it between'],
    ['an unknown distro', concept('example').replace('debian, ubuntu', 'debian, gentoo'), 'unknown distro gentoo'],
    ['a bad citation', concept('example', { front: 'related: kill' }), 'expected a man page citation'],
    ['an unknown key', concept('example', { front: 'author: someone' }), 'unknown key author'],
  ])('rejects %s', (_, text, message) => {
    expect(() => build({ 'example.md': text })).toThrow(message)
  })

  it('rejects a status outside the review flow', () => {
    expect(() => build({ 'example.md': concept('example').replace('status: pending-owner', 'status: published') })).toThrow('status is one of')
  })
})
