import type { CatalogMeta } from '../../locales'

/**
 * Translated by an LLM, then reviewed by two model panels (GPT-6.1 Sol and Grok 4.7), whose corrections were all
 * applied, and checked by an independent review that every correction landed (docs/i18n.md). A language renders
 * publicly only while `status` is `reviewed`; a fix that changes meaning sets it back to `needs-review` until re-read.
 */
export const meta: CatalogMeta = {
  lang: 'fr',
  status: 'reviewed',
  translatedBy: 'claude-sonnet-5-5',
  translatedOn: '2026-10-30',
  reviewedBy: ['GPT-6.1 Sol (model panel)', 'Grok 4.7 (model panel)', 'independent review of the applied corrections'],
  reviewedOn: '2026-10-30',
}
