import type { ExampleSnippet } from '../../lib/examples'
import { CodeBlock } from '../doc/CodeBlock'
import { ManSectionLabel } from './RunningHead'

export function ManPageExamples({ examples }: { examples: ExampleSnippet[] }) {
  if (!examples.length) return null

  return (
    <section aria-label="Quick examples" className="mt-8">
      <ManSectionLabel as="h2">EXAMPLES</ManSectionLabel>
      <div className="mt-3 space-y-5 pl-6 sm:pl-8">
        {examples.map((example, index) => (
          <div key={index} className="space-y-2">
            {example.label ? (
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted">{example.label}</p>
            ) : null}
            <CodeBlock text={example.text} languageHint={example.languageHint} />
          </div>
        ))}
      </div>
    </section>
  )
}
