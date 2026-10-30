import { common, type CommonKey } from './common'

/**
 * What the man page script shows, after `common`. A page in another language carries its translations as
 * the JSON data block `#bm-i18n`.
 */
const own = [
  'Link copied',
  'Copied',
  'Bookmarked {citation}.',
  'Removed bookmark for {citation}.',
  'man.bookmarkRemoveLabel\u0004Remove bookmark for {citation}',
  'Bookmarked: {citation} (m)',

  'Command composer',
  'Command',
  'Clear',
  'Command cleared.',
  'Value for {flag} ({name})',
  'Optional value for {flag} ({name})',
  'Fill in {missing} to copy.',
  'add',
  'remove',
  'Add {flag} to the command',
  'Remove {flag} from the command',
  'Added {flag}. {warnings}',
  'Removed {flag}.',
  // Translator note: {modes} is flags joined by the language's list word ('and'), e.g. '-c and -x'.
  'Choose one mode: {modes} conflict.',
  // Translator note: {words} is one of the 'not on …', 'differs on …', 'unknown on …' messages.
  '{flag}: {words}.',

  'Find in page…',
  'Previous match',
  'Next match',
  'Close find',
  'Match {index} of {count}',

  // Translator note: {terms} is the selected option's flags (mono, never translated).
  'Highlighting {terms}',
  'options.clear\u0004Clear',
  '{shown} of {total}',

  'Preview unavailable right now.',
  'No page by this name in this edition.',

  'Find a row',
  // Translator note: {table} is the message 'table {n}' (e.g. 'table 2'), inserted as a noun phrase.
  'Find a row in {table}',
  'table {n}',
  'Original order',
  'Sort by this column',
  '{count, plural, one {# row} other {# rows}}',
] as const

export const man = [...common, ...own] as const

export type ManKey = CommonKey | (typeof own)[number]
export type { CommonKey }
