import { Link } from '@tanstack/react-router'
import type { BlockNode, InlineNode } from '../api/types'

export function DocRenderer({ blocks }: { blocks: BlockNode[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => (
        <BlockView key={blockKey(block, idx)} block={block} />
      ))}
    </div>
  )
}

function blockKey(block: BlockNode, fallbackIdx: number) {
  if (block.type === 'heading') return `h:${block.id}`
  if (block.type === 'code_block' && block.id) return `code:${block.id}`
  return `${block.type}:${fallbackIdx}`
}

function BlockView({ block }: { block: BlockNode }) {
  switch (block.type) {
    case 'heading': {
      const level = clamp(block.level, 2, 6)
      const Tag = (`h${level}` as unknown) as 'h2'
      return (
        <Tag
          id={block.id}
          className="scroll-mt-24 pt-6 text-[color:var(--bm-fg)] first:pt-0 data-[level=2]:text-xl data-[level=2]:font-semibold data-[level=3]:text-lg data-[level=3]:font-semibold data-[level=4]:text-base data-[level=4]:font-semibold"
          data-level={level}
        >
          <a href={`#${block.id}`} className="no-underline hover:underline">
            {block.text}
          </a>
        </Tag>
      )
    }

    case 'paragraph':
      return (
        <p className="text-sm leading-7 text-[color:var(--bm-fg)]">{renderInlines(block.inlines)}</p>
      )

    case 'list': {
      const ListTag = (block.ordered ? 'ol' : 'ul') as 'ul'
      return (
        <ListTag
          className={`ml-6 space-y-2 text-sm leading-7 text-[color:var(--bm-fg)] ${
            block.ordered ? 'list-decimal' : 'list-disc'
          }`}
        >
          {block.items.map((itemBlocks, idx) => (
            <li key={idx}>
              <div className="space-y-2">
                {itemBlocks.map((child, childIdx) => (
                  <BlockView key={blockKey(child, childIdx)} block={child} />
                ))}
              </div>
            </li>
          ))}
        </ListTag>
      )
    }

    case 'definition_list':
      return (
        <dl className="space-y-4">
          {block.items.map((item, idx) => (
            <div key={item.id ?? idx}>
              <dt
                id={item.id ?? undefined}
                className="scroll-mt-24 font-mono text-sm font-semibold text-[color:var(--bm-fg)]"
              >
                {renderInlines(item.termInlines)}
              </dt>
              <dd className="mt-2 space-y-2 pl-4 text-sm text-[color:var(--bm-muted)]">
                {item.definitionBlocks.map((child, childIdx) => (
                  <BlockView key={blockKey(child, childIdx)} block={child} />
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )

    case 'code_block':
      return (
        <pre
          id={block.id ?? undefined}
          className="scroll-mt-24 overflow-x-auto rounded-lg border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.6] p-4 text-sm leading-6"
        >
          <code>{block.text}</code>
        </pre>
      )

    case 'table':
      return (
        <div className="overflow-x-auto rounded-lg border border-[var(--bm-border)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[color:var(--bm-bg)/0.7] text-[color:var(--bm-muted)]">
              <tr>
                {block.headers.map((h, idx) => (
                  <th key={idx} className="border-b border-[var(--bm-border)] px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="odd:bg-[color:var(--bm-bg)/0.35]">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="border-b border-[var(--bm-border)] px-3 py-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'horizontal_rule':
      return <hr className="my-6 border-[var(--bm-border)]" />
  }
}

function renderInlines(inlines: InlineNode[]) {
  return inlines.map((inline, idx) => {
    switch (inline.type) {
      case 'text':
        return <span key={idx}>{inline.text}</span>
      case 'code':
        return (
          <code
            key={idx}
            className="rounded bg-[color:var(--bm-bg)/0.8] px-1 py-0.5 font-mono text-[0.95em]"
          >
            {inline.text}
          </code>
        )
      case 'emphasis':
        return (
          <em key={idx} className="italic">
            {renderInlines(inline.inlines)}
          </em>
        )
      case 'strong':
        return (
          <strong key={idx} className="font-semibold">
            {renderInlines(inline.inlines)}
          </strong>
        )
      case 'link':
        if (inline.linkType === 'external') {
          return (
            <a
              key={idx}
              href={inline.href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 decoration-[color:var(--bm-accent)/0.6]"
            >
              {renderInlines(inline.inlines)}
            </a>
          )
        }
        return (
          <Link
            key={idx}
            to={inline.href as never}
            className="underline underline-offset-4 decoration-[color:var(--bm-accent)/0.6]"
          >
            {renderInlines(inline.inlines)}
          </Link>
        )
    }
  })
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}
