import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ManPageOptionsSection } from './ManPageOptionsSection'

it('describes stale evidence without promising a build and never links to raw JSON', () => {
  const html = renderToStaticMarkup(<ManPageOptionsSection
    optionTerms={[]} options={[{ flags: '--one', anchorId: 'one', description: 'One option.' }]}
    rowIds={new Map()} optionsCount={1} optionsExpanded={false}
    portability={{ stale: true, portability: { systems: [], rows: [['one', 'aep']], total: 1, available: 1, nextOffset: null } }}
    onClearHighlight={() => {}} onOptionsExpandedChange={() => {}} onSelectOption={() => {}}
  />)
  expect(html).toContain('Portability reflects an earlier snapshot')
  expect(html).not.toContain('being built')
  expect(html).not.toContain('/api/')
  expect(html).not.toContain('Per-distro portability details')
})

it('keeps the native options disclosure and section locators when derived data is present', () => {
  const options = Array.from({ length: 21 }, (_, i) => ({ flags: `--option-${i}`, anchorId: `option-${i}`, description: `Option ${i}.` }))
  const html = renderToStaticMarkup(<ManPageOptionsSection
    optionTerms={[]} options={options} rowIds={new Map()}
    locators={new Map(options.map((option) => [option.anchorId, '2.1']))}
    optionsCount={options.length} optionsExpanded={false}
    portability={{ stale: false, portability: { systems: [], rows: [['option-0', 'aep']], total: options.length, available: options.length, nextOffset: null } }}
    onClearHighlight={() => {}} onOptionsExpandedChange={() => {}} onSelectOption={() => {}}
  />)
  expect(html).toContain('Index of options')
  expect(html).toContain('<details')
  expect(html).toContain('Show all 21 options')
  expect(html).toContain('--option-20')
  expect(html).toContain('2.1')
  expect(html).toContain('aria-label="Filter options"')
  expect(html).toContain('manual page not included on this system')
})
