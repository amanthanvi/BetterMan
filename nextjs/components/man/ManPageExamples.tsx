import type { ExampleSnippet } from '../../lib/examples'
import { CodeBlock, type CodeLanguage } from '../doc/CodeBlock'
import { ManSectionLabel } from './RunningHead'

export function ManPageExamples({ examples, codeLanguage }: { examples: ExampleSnippet[]; codeLanguage?: CodeLanguage }) {
  if (!examples.length) return null

  return (
    <section className="mb-10" aria-label="Quick examples">
      <ManSectionLabel>EXAMPLES</ManSectionLabel>
      <div className="mt-3 space-y-5 pl-6 sm:pl-8">
        {examples.map((example, index) => (
          <div key={index} className="space-y-2">
            {example.label ? <p className="text-sm text-muted">{example.label}</p> : null}
            <CodeBlock text={example.text} languageHint={example.languageHint} defaultLanguage={codeLanguage} />
          </div>
        ))}
      </div>
    </section>
  )
}
