import { Fragment } from 'react'

import type { ConceptBlock, ConceptInline } from '../../lib/concepts'
import type { ServerT } from '../../lib/i18n/server'
import { manPageHref, withDistro, type Distro } from '../../lib/distro'

const LINK = 'underline decoration-rule-2 underline-offset-[3px] hover:text-accent'

/** A man page citation set the way the manual sets one: **name**(section). */
export function Citation({ name, section, urlDistro, className }: { name: string; section: string; urlDistro: Distro | null; className?: string }) {
  return (
    <a href={manPageHref(name, section, urlDistro)} className={className ?? LINK}>
      <b className="font-semibold">{name}</b>({section})
    </a>
  )
}

function Inlines({ inlines, urlDistro, published }: { inlines: ConceptInline[]; urlDistro: Distro | null; published: Set<string> }) {
  return inlines.map((inline, index) => {
    switch (inline.t) {
      case 'code':
        return (
          <code key={index} className="whitespace-nowrap font-mono text-[0.9375em]">
            {inline.v}
          </code>
        )
      case 'em':
        return <em key={index}>{inline.v}</em>
      case 'man':
        return <Citation key={index} name={inline.name} section={inline.section} urlDistro={urlDistro} />
      case 'concept':
        // Another explainer links only once it is published itself.
        return published.has(inline.slug) ? (
          <a key={index} href={withDistro(`/concept/${encodeURIComponent(inline.slug)}`, urlDistro)} className={LINK}>
            {inline.v}
          </a>
        ) : (
          <Fragment key={index}>{inline.v}</Fragment>
        )
      default:
        return <Fragment key={index}>{inline.v}</Fragment>
    }
  })
}

/**
 * An explainer's text, from the compiled AST: data, never markup, so nothing in a
 * content file can inject HTML. BetterMan's voice: system sans, mono for what you type.
 */
export function ConceptText({ blocks, urlDistro, published, t }: { blocks: ConceptBlock[]; urlDistro: Distro | null; published: Set<string>; t: ServerT }) {
  return (
    <div className="space-y-4 text-[1.0625rem] leading-[1.6]">
      {blocks.map((block, index) => {
        if (block.type === 'pre') {
          return (
            <div key={index} className="bm-code">
              <pre tabIndex={0} role="group" aria-label={t('Example')} className="font-mono">
                {block.text}
              </pre>
            </div>
          )
        }
        if (block.type === 'p') {
          return (
            <p key={index}>
              <Inlines inlines={block.inlines} urlDistro={urlDistro} published={published} />
            </p>
          )
        }
        const List = block.type === 'ol' ? 'ol' : 'ul'
        return (
          <List key={index} className={`space-y-1.5 pl-6 ${block.type === 'ol' ? 'list-decimal' : 'list-disc'}`}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="pl-1">
                <Inlines inlines={item} urlDistro={urlDistro} published={published} />
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
