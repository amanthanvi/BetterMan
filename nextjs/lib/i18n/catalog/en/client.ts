import { common, type CommonKey } from './common'

/**
 * What the App Router client shows, and the stateless components the server shares with it (results,
 * top hit, contents), after `common`. Another language's translations arrive from the server with the page.
 */
const own = [
  'Skip to content',
  'Site header',
  'Site footer',
  'BetterMan home',
  'Search ⌘K',
  'Command palette (Ctrl/⌘ K)',
  'Search',
  'Offline — showing cached content',
  'Could not open. Try again.',
  'the Unix manual, typeset',
  // Translator note: {when} is a relative time such as '2 days ago' or a date. Put the participle 'updated' inside each plural form so it agrees with the count.
  '{count, plural, one {# page} other {# pages}} · updated {when}',
  'Dataset {id}',
  'Licenses',
  'Suggest a fix for this translation',

  'Recent',
  'Bookmarks',
  'No recent pages',
  'Pages you open are listed here.',
  'No bookmarks yet',
  // Translator note: {key} is the m keycap, drawn as an element.
  'Press {key} on a page to keep it here.',
  'Remove',
  'Remove bookmark for {citation}',

  'Search man pages',
  'search man pages…',
  // Translator note: {examples} is a comma-separated list of three typed queries (tar, ssh, copy files), links, never translated.
  'Search by command name or by what it does. Try {examples}.',
  '{count, plural, one {# result loaded} other {# results loaded}}',
  'Load more',
  'Load more results',
  'Load more results, Loading',
  'Load more results, All results loaded',
  'All results loaded',
  'Failed to load more',

  'Search results',
  // Translator note: {query} is what the reader typed, in a quotation element.
  'Results for {query}',
  'section {section}',
  'read as a task',
  // Translator note: {query} is what the reader typed, in a quotation element.
  'No results for {query}.',
  'Search command names, flags, words from a page’s description, or a task in plain words, such as “extract a tarball”.',
  'Names with dots or underscores are searched as written, like {example}.',
  // Translator note: {list} is a comma-separated list of suggested search terms (links, never translated).
  'Did you mean: {list}?',
  'Explain {command} token by token',
  'Task match: “{phrase}”',
  'generated',

  'Explain this line',
  'Key flags of {citation}',
  'Package',
  'Package {name}',
  'adapted',

  'from EXAMPLES',
  'generated · verified',

  'Filter section {section}',
  '{count} on this page',
  '{visible} of {shown} on this page',

  'Attribution',
  'Attribution and license notices for the current dataset release.',
  'Dataset',
  'Ingested',
  // Translator note: {license} is the link text 'SIL Open Font License', a proper name; adapt the article and case around it.
  'The manual is set in BM Text, a subset of Adobe’s Source Serif 4 under the {license}.',
  'SIL Open Font License',
  // Translator note: {source} is the link text 'tldr-pages' and {license} the link text 'CC BY 4.0'; both are names and are not inflected.
  'Examples marked tldr-pages come from {source}, © the tldr-pages team and contributors, under {license}. BetterMan converts their placeholders, showing the first of alternative values, and keeps only examples whose flags it verifies against the manual shown; each example links to its source file.',
  'Package manifest',
  'View full package manifest (JSON)',
  'Filter packages',
  'Filter packages…',
  'Load more packages ({shown} of {total})',
  'Select a package to view its license text.',
  'Loading license text…',
  'Failed to load license text.',
  'License text for {name}',
  'No license text.',

  'Tokens',
  'Definition',
  'Close definition',
  'Command line to explain',
  'Paste a command line',

  'Something went wrong',
  'The page failed to render.',
  // Translator note: keep the English word 'Digest' so that reports quote the label; {digest} is an opaque identifier.
  'Digest: {digest}',
  'Retry',
  'BetterMan explainer',
  // Translator note: {pages} is a comma-separated list of man page citations such as tar(1); the phrase follows "BetterMan explainer · ".
  'on {pages}',
] as const

export const client = [...common, ...own] as const

export type ClientKey = CommonKey | (typeof own)[number]
export type { CommonKey }
