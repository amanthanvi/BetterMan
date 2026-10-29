'use client'

import { useCallback, useEffect, useState, type MouseEvent } from 'react'

import { noteId } from '../../lib/explain'
import { DefinitionCard } from './DefinitionCard'

export type TokenCellView = {
  text: string
  kind: string
  label: string
  tokens: Array<{ n: number; value: string }>
}

function range(cell: TokenCellView) {
  const first = cell.tokens[0].n
  const last = cell.tokens.at(-1)!.n
  return first === last ? `${first}` : `${first}–${last}`
}

/**
 * The numbered token grid. Every token links to its note in the list below, so
 * without JavaScript the grid is a table of contents. With it, a token opens
 * its one definition in a card; a cluster's flags open one at a time.
 */
export function ExplainTokens({ cells }: { cells: TokenCellView[] }) {
  const [selected, setSelected] = useState<number | null>(null)
  const close = useCallback(() => setSelected(null), [])

  const pick = (n: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    setSelected((current) => (current === n ? null : n))
  }

  useEffect(() => {
    if (selected === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const link = (token: TokenCellView['tokens'][number], children: React.ReactNode, className: string) => (
    <a
      href={`#${noteId(token.n)}`}
      onClick={pick(token.n)}
      aria-current={selected === token.n ? 'true' : undefined}
      className={className}
    >
      {children}
    </a>
  )

  return (
    <>
      <ol aria-label="Tokens" className="bm-tks">
        {cells.map((cell) =>
          cell.tokens.length === 1 ? (
            <li key={cell.tokens[0].n} className="bm-tk" data-kind={cell.kind}>
              {link(
                cell.tokens[0],
                <>
                  <span className="bm-tk-n">{range(cell)}</span>
                  <code className="bm-tk-t">{cell.text}</code>
                  <span className="bm-tk-l">{cell.label}</span>
                </>,
                'bm-tk-a',
              )}
            </li>
          ) : (
            <li key={cell.tokens[0].n} className="bm-tk" data-kind={cell.kind}>
              <span className="bm-tk-n">{range(cell)}</span>
              <code className="bm-tk-t">{cell.text}</code>
              <span className="bm-tk-split">
                {cell.tokens.map((token) => (
                  <span key={token.n}>{link(token, <code>{token.value}</code>, 'bm-tk-f')}</span>
                ))}
              </span>
              <span className="bm-tk-l">{cell.label}</span>
            </li>
          ),
        )}
      </ol>
      <DefinitionCard selected={selected} onClose={close} />
    </>
  )
}
