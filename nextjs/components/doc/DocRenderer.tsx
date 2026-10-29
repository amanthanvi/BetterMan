import { Fragment, type ReactNode } from 'react'

import { withDistro, type Distro } from '../../lib/distro'
import type { BlockNode, InlineNode } from '../../lib/docModel'
import { findExternalUrls } from '../../lib/externalUrls'
import { CodeBlock, type CodeLanguage } from './CodeBlock'

type RenderCtx = {
  codeLanguage?: CodeLanguage
  sectionNumbers?: ReadonlyMap<string, string>
}

/**
 * The manual as plain server HTML. Find and option highlighting are applied to
 * this markup in the browser (man-client/marks.ts), so the server output is the
 * same for every reader and can be cached.
 */
export function DocRenderer({
  blocks,
  urlDistro,
  codeLanguage,
  sectionNumbers,
}: {
  blocks: BlockNode[]
  /** The page URL's own `?distro=`, which internal links carry; null for a bare URL. */
  urlDistro: Distro | null
  /** Highlighting for code blocks the parser gave no language. */
  codeLanguage?: CodeLanguage
  /** Hanging numbers per heading id, from `sectionNumbers()`. */
  sectionNumbers?: ReadonlyMap<string, string>
}) {
  const ctx: RenderCtx = { codeLanguage, sectionNumbers }

  // The typography is `.bm-manual` in globals.css; blocks render as plain elements.
  // Long pages only: `.bm-doc > *` in globals.css gives each top-level block
  // `content-visibility: auto`, and the estimate stands in for its height until
  // it has rendered once. Short pages keep the plain block list.
  const skipOffscreen = blocks.length > SKIP_OFFSCREEN_MIN_BLOCKS
  const estimates = skipOffscreen ? blocks.map((block) => estimateBlockHeight(block)) : null

  if (!estimates) {
    return (
      <div className="bm-manual">
        {blocks.map((block, idx) => (
          <BlockView key={blockKey(block, idx)} block={block} ctx={ctx} urlDistro={urlDistro} />
        ))}
      </div>
    )
  }

  return (
    <div className="bm-manual bm-doc">
      {blocks.map((block, idx) => (
        <div key={blockKey(block, idx)} style={{ containIntrinsicBlockSize: `auto ${estimates[idx]}px` }}>
          <BlockView block={block} ctx={ctx} urlDistro={urlDistro} />
        </div>
      ))}
    </div>
  )
}

function blockKey(block: BlockNode, fallbackIdx: number) {
  if (block.type === 'heading') return `h:${block.id}`
  if (block.type === 'code_block' && block.id) return `code:${block.id}`
  return `${block.type}:${fallbackIdx}`
}

// Below this a full-document restyle is cheap anyway (ssh_config(5), 40 blocks:
// about 130 ms at 4x CPU); bash(1) has 573 blocks.
export const SKIP_OFFSCREEN_MIN_BLOCKS = 150

// Rough desktop heights at the default reading preferences: 18px serif at 1.62
// line height in a 42.5rem column, with each block's top margin. Accuracy only
// affects the scrollbar and deep links before a block first renders.
const LINE_PX = 29

function estimateBlockHeight(block: BlockNode, charsPerLine = 80): number {
  switch (block.type) {
    case 'heading':
      return block.level <= 2 ? 76 : 62
    case 'paragraph':
      return 15 + LINE_PX * Math.ceil(Math.max(1, inlinesLength(block.inlines)) / charsPerLine)
    case 'list':
      return block.items.reduce((sum, item) => sum + 6 + item.reduce((s, b) => s + estimateBlockHeight(b, charsPerLine - 10), 0), 0)
    case 'definition_list':
      // The term sits on its own line above an indented definition.
      return block.items.reduce(
        (sum, item) => sum + 40 + item.definitionBlocks.reduce((s, b) => s + estimateBlockHeight(b, charsPerLine - 4), 0),
        15,
      )
    case 'code_block':
      return 20 + 23 * block.text.split('\n').length
    case 'table':
      return 50 + 34 * block.rows.length
    case 'horizontal_rule':
      return 16
  }
}

function inlinesLength(inlines: InlineNode[]): number {
  return inlines.reduce((sum, inline) => sum + (inline.type === 'text' || inline.type === 'code' ? inline.text.length : inlinesLength(inline.inlines)), 0)
}

function BlockView({ block, ctx, urlDistro }: { block: BlockNode; ctx: RenderCtx; urlDistro: Distro | null }) {
  switch (block.type) {
    case 'heading': {
      const level = clamp(block.level, 2, 6)
      const Tag = (`h${level}` as unknown) as 'h2'
      return (
        <Tag id={block.id} data-n={ctx.sectionNumbers?.get(block.id)}>
          <a href={`#${block.id}`}>{block.text}</a>
        </Tag>
      )
    }

    case 'paragraph':
      return <p>{renderInlines(block.inlines, ctx, urlDistro)}</p>

    case 'list': {
      const ListTag = (block.ordered ? 'ol' : 'ul') as 'ol'
      return (
        <ListTag>
          {block.items.map((itemBlocks, idx) => (
            <li key={idx}>
              {itemBlocks.map((child, childIdx) => (
                <BlockView key={blockKey(child, childIdx)} block={child} ctx={ctx} urlDistro={urlDistro} />
              ))}
            </li>
          ))}
        </ListTag>
      )
    }

    case 'definition_list':
      /* troff .TP: the term on its own line, the definition under it with a hanging indent. */
      return (
        <dl>
          {block.items.map((item, idx) => (
            <Fragment key={item.id ?? idx}>
              <dt id={item.id ?? undefined}>{renderInlines(item.termInlines, ctx, urlDistro)}</dt>
              <dd>
                {item.definitionBlocks.map((child, childIdx) => (
                  <BlockView key={blockKey(child, childIdx)} block={child} ctx={ctx} urlDistro={urlDistro} />
                ))}
              </dd>
            </Fragment>
          ))}
        </dl>
      )

    case 'code_block':
      return (
        <CodeBlock
          id={block.id}
          text={block.text}
          languageHint={block.languageHint ?? undefined}
          defaultLanguage={ctx.codeLanguage}
        />
      )

    case 'table':
      return (
        // Wide tables scroll sideways, so the scroller takes keyboard focus.
        <div className="bm-tbl" tabIndex={0} role="group" aria-label="Table">
          <table>
            <thead>
              <tr>
                {block.headers.map((h, idx) => (
                  <th key={idx}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx}>{linkifyText(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'horizontal_rule':
      return <hr />
  }
}

/** `linkify` turns plain-text URLs into links; it is off inside an existing link. */
function renderInlines(inlines: InlineNode[], ctx: RenderCtx, urlDistro: Distro | null, linkify = true): ReactNode[] {
  return inlines.map((inline, idx) => {
    switch (inline.type) {
      case 'text':
        return <span key={idx}>{linkify ? linkifyText(inline.text) : inline.text}</span>
      case 'code':
        /* troff bold: "type this literally". Bold serif in prose, bold mono in option terms. */
        return <code key={idx}>{inline.text}</code>
      case 'emphasis':
        return (
          <em key={idx}>
            {renderInlines(inline.inlines, ctx, urlDistro, linkify)}
          </em>
        )
      case 'strong':
        return (
          <strong key={idx}>
            {renderInlines(inline.inlines, ctx, urlDistro, linkify)}
          </strong>
        )
      case 'link':
        if (inline.linkType === 'external') {
          return (
            <ExternalLink key={idx} href={inline.href}>
              {renderInlines(inline.inlines, ctx, urlDistro, false)}
            </ExternalLink>
          )
        }
        if (inline.linkType === 'unresolved') {
          return (
            <span key={idx} className="bm-unresolved" title="Not available in this dataset">
              {renderInlines(inline.inlines, ctx, urlDistro, false)}
              <span className="sr-only"> (not available)</span>
            </span>
          )
        }
        return (
          <a key={idx} href={inline.href.startsWith('/') ? withDistro(inline.href, urlDistro) : inline.href}>
            {renderInlines(inline.inlines, ctx, urlDistro, false)}
          </a>
        )
    }
  })
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="bm-ext [overflow-wrap:anywhere]">
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  )
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

/** Plain-text URLs in a text run become external links; the rest stays text. */
function linkifyText(text: string): ReactNode {
  const urls = findExternalUrls(text)
  if (!urls.length) return text
  const out: ReactNode[] = []
  let cursor = 0
  for (const url of urls) {
    if (url.start > cursor) out.push(<span key={`t:${cursor}`}>{text.slice(cursor, url.start)}</span>)
    out.push(
      <ExternalLink key={`u:${url.start}`} href={url.href}>
        <span>{text.slice(url.start, url.end)}</span>
      </ExternalLink>,
    )
    cursor = url.end
  }
  if (cursor < text.length) out.push(<span key={`t:${cursor}`}>{text.slice(cursor)}</span>)
  return out
}
