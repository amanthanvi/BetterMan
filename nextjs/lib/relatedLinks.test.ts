import { describe, expect, it, vi } from 'vitest'
import { cachedRelatedItem, resolveRelatedItems, type RelatedItem } from '../../convex/_relatedLinks'

const page = (name: string, section = '1'): RelatedItem => ({
  name, section, title: `${name}(${section})`, description: `${name} description`,
})
const link = (name: string, section = '1') => ({ toName: name, toSection: section })
const cachedLink = (name: string, section = '1') => ({
  ...link(name, section), toTitle: page(name, section).title, toDescription: page(name, section).description,
})

describe('related link metadata', () => {
  it('returns 50 denormalized results without target lookups', async () => {
    const links = Array.from({ length: 50 }, (_, index) => cachedLink(`page${index}`))
    const lookup = vi.fn(async () => null)
    expect(await resolveRelatedItems(links, lookup, 50)).toEqual(
      Array.from({ length: 50 }, (_, index) => page(`page${index}`)),
    )
    expect(lookup).not.toHaveBeenCalled()
  })

  it('preserves priority, deduplication, missing-target filtering, and the result limit', async () => {
    const lookup = vi.fn(async (name: string, section: string) => name === 'missing' ? null : page(name, section))
    const links = [link('missing'), cachedLink('first'), link('first'), link('second'), link('third')]
    expect(await resolveRelatedItems(links, lookup, 2)).toEqual([page('first'), page('second')])
    expect(lookup.mock.calls).toEqual([['missing', '1'], ['second', '1'], ['third', '1']])
  })

  it('keeps sections distinct and projects the legacy result shape', async () => {
    const lookup = vi.fn(async (name: string, section: string) => ({ ...page(name, section), privateField: true }))
    expect(await resolveRelatedItems([link('printf'), link('printf', '3')], lookup, 50)).toEqual([
      page('printf'), page('printf', '3'),
    ])
  })

  it('accepts empty metadata strings but falls back for partially migrated links', async () => {
    expect(cachedRelatedItem({ ...link('empty'), toTitle: '', toDescription: '' })).toEqual({
      name: 'empty', section: '1', title: '', description: '',
    })
    const lookup = vi.fn(async (name: string, section: string) => page(name, section))
    expect(await resolveRelatedItems([{ ...link('partial'), toTitle: 'old' }], lookup, 50)).toEqual([page('partial')])
    expect(lookup).toHaveBeenCalledOnce()
  })

  it('resolves a forward reference when the target arrives after an earlier miss', async () => {
    const targets = new Map<string, RelatedItem>()
    const lookup = async (name: string) => targets.get(name) ?? null
    const links = [link('later')]
    expect(await resolveRelatedItems(links, lookup, 50)).toEqual([])
    targets.set('later', page('later'))
    expect(await resolveRelatedItems(links, lookup, 50)).toEqual([page('later')])
  })
})
