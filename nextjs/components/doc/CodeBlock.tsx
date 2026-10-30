import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import makefile from 'highlight.js/lib/languages/makefile'
import python from 'highlight.js/lib/languages/python'

import type { ServerT } from '../../lib/i18n/server'
import { CopyIcon } from '../icons'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('makefile', makefile)
hljs.registerLanguage('python', python)

export type CodeLanguage = 'bash' | 'c' | 'makefile' | 'python'

/** Sections 2, 3 and 9 document C interfaces, except Perl modules (3pm, 3perl); the rest show shell. */
export function defaultCodeLanguage(section: string): CodeLanguage {
  return /^[239](?!pm|perl)/i.test(section) ? 'c' : 'bash'
}

/**
 * A code block, highlighted on the server. The copy button and any find or
 * option marks are the man page script's (man-client/); while marks are shown,
 * it swaps the block to plain text, as the highlighter's spans would split them.
 */
export function CodeBlock({
  id,
  text,
  languageHint,
  defaultLanguage = 'bash',
  label,
  t,
}: {
  id?: string | null
  text: string
  /** Accessible name for the scrollable block; `man.code` by default. */
  label?: string
  t: ServerT
  languageHint?: string | null
  /** Used when `languageHint` is missing or unknown. */
  defaultLanguage?: CodeLanguage
}) {
  const language = normalizeLanguageHint(languageHint) ?? defaultLanguage
  return (
    <div id={id ?? undefined} className="bm-code">
      <button type="button" className="bm-copy bm-js" data-bm-action="copy-code" aria-label={t('Copy code block')} title={t('Copy')}>
        <CopyIcon />
      </button>
      {/* Long lines scroll sideways rather than wrap, so the block takes keyboard focus. */}
      <pre tabIndex={0} role="group" aria-label={label ?? t('Code')}>
        <code className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: highlightCode(text, language) }} />
      </pre>
    </div>
  )
}

/** Highlighter HTML, or the escaped text for diagrams (box drawing) and very long blocks. */
export function highlightCode(text: string, language: CodeLanguage): string {
  if (!shouldHighlight(text) || text.length > 20_000) return escapeHtml(text)
  try {
    return hljs.highlight(text, { language, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(text)
  }
}

function normalizeLanguageHint(hint?: string | null): CodeLanguage | null {
  if (!hint) return null
  const cleaned = hint.trim().toLowerCase()
  if (!cleaned) return null

  if (['bash', 'shell', 'sh', 'zsh', 'console'].includes(cleaned)) return 'bash'
  if (['python', 'py'].includes(cleaned)) return 'python'
  if (['c', 'c99', 'c11', 'cpp', 'c++'].includes(cleaned)) return 'c'
  if (['make', 'makefile'].includes(cleaned)) return 'makefile'

  return null
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function shouldHighlight(text: string) {
  // preserve box-drawing diagrams as plain monospace
  if (/[\u2500-\u257F]/.test(text)) return false
  return true
}
