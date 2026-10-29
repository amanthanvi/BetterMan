import type { ExampleSnippet } from '../../lib/examples'
import { CodeBlock, type CodeLanguage } from '../doc/CodeBlock'

/**
 * Short commands lifted from the page's own EXAMPLES section. BetterMan's
 * addition, so it speaks in the sans on the added tint, with its source named.
 */
export function ManPageExamples({ examples, codeLanguage }: { examples: ExampleSnippet[]; codeLanguage?: CodeLanguage }) {
  if (!examples.length) return null

  return (
    <section className="bm-added mb-12 px-5 pt-4 pb-3 max-md:-mx-5 md:px-8 md:pt-5" aria-label="Quick examples">
      <p className="text-sm font-semibold text-ink">
        Examples <span className="ml-1.5 font-normal text-ink-3">· from EXAMPLES below, added by BetterMan</span>
      </p>
      <ul className="mt-3">
        {examples.map((example, index) => (
          <li key={index} className="mb-3">
            {example.label ? <p className="text-sm text-ink-2">{example.label}</p> : null}
            <CodeBlock text={example.text} languageHint={example.languageHint} defaultLanguage={codeLanguage} label="Example" />
          </li>
        ))}
      </ul>
    </section>
  )
}
