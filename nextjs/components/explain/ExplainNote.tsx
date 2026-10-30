import type { PortabilityCells } from '../../lib/api'
import type { NumberedToken } from '../../lib/explain'
import { PortabilityGlyph } from '../man/PortabilityGlyph'

/**
 * One explained token: its number, the token as typed, the engine's kind, the
 * manual's own excerpt and the source it was matched in. Shared by the numbered
 * list and the definition card, so both say exactly the same thing.
 */
export function ExplainNote({ token, portability }: { token: NumberedToken; portability?: PortabilityCells | null }) {
  const codes = token.kind === 'option' && token.anchor ? portability?.cells[token.anchor] : undefined
  const excerpt = token.excerpt || (token.shell?.excerpt ?? '')
  return (
    <>
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-3">
        <span className="bm-xn-n">{token.n}</span>
        {/* A token can be any length (a 200-character path): it wraps anywhere rather than overflow. */}
        <code className="min-w-0 max-w-full font-mono text-[1.0625rem] font-semibold [overflow-wrap:anywhere]">{token.kind === 'option' ? token.value : token.text}</code>
        <span className="small-caps text-[0.9375rem] text-ink-3">{token.label}</span>
        {codes && portability ? <PortabilityGlyph codes={codes} systems={portability.systems} always /> : null}
      </p>
      {excerpt ? <p className="mt-1.5 font-serif text-[1.0625rem] leading-[1.58] text-ink [overflow-wrap:anywhere]">{excerpt}</p> : null}
      {token.kind === 'unknown' ? (
        <p className="mt-1.5 font-serif text-[1.0625rem] italic text-ink-2">No manual definition was matched for this token.</p>
      ) : null}
      {token.href && token.source ? (
        <p className="mt-1.5 text-xs">
          <a href={token.href} className="text-ink-3 underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
            {token.source}
          </a>
        </p>
      ) : null}
    </>
  )
}
