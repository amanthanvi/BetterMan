import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { BlockNode } from '../../lib/docModel'
import { extractExamples } from '../../lib/examples'
import { DocRenderer } from '../doc/DocRenderer'
import { ManPageExamples } from './ManPageExamples'

describe('ManPageExamples', () => {
  it('renders nothing for an empty preview', () => {
    expect(renderToStaticMarkup(<ManPageExamples examples={[]} />)).toBe('')
  })

  it('reuses copyable code blocks with language hints and escaped paragraph labels', () => {
    const html = renderToStaticMarkup(<ManPageExamples examples={[
      { label: 'Build <target>', text: 'make all', languageHint: 'makefile' },
      { label: null, text: 'tar -xf archive.tar' },
    ]} />)
    expect(html).toContain('aria-label="Quick examples"')
    expect(html).toContain('Build &lt;target&gt;')
    expect(html).toContain('language-makefile')
    expect(html.match(/aria-label="Copy code block"/g)).toHaveLength(2)
  })

  it('keeps each source anchor unique when the preview and source document render together', () => {
    const blocks: BlockNode[] = [
      { type: 'heading', id: 'examples', text: 'EXAMPLES', level: 2 },
      { type: 'code_block', id: 'example-1', text: 'tar -xf archive.tar', languageHint: 'bash' },
    ]
    const html = renderToStaticMarkup(<>
      <ManPageExamples examples={extractExamples(blocks)} />
      <DocRenderer blocks={blocks} distro="debian" />
    </>)
    expect(html.match(/id="examples"/g)).toHaveLength(1)
    expect(html.match(/id="example-1"/g)).toHaveLength(1)
    expect(html.match(/aria-label="Copy code block"/g)).toHaveLength(2)
  })
})
