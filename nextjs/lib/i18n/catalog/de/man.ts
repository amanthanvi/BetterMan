import type { ManKey, CommonKey } from '../en/man'
import { common } from './common'

const own: Record<Exclude<ManKey, CommonKey>, string> = {
  'Link copied': 'Link kopiert',
  'Copied': 'Kopiert',
  'Bookmarked {citation}.': 'Lesezeichen für {citation} gesetzt.',
  'Removed bookmark for {citation}.': 'Lesezeichen für {citation} entfernt.',
  'man.bookmarkRemoveLabel\u0004Remove bookmark for {citation}': 'Lesezeichen für {citation} entfernen',
  'Bookmarked: {citation} (m)': 'Mit Lesezeichen: {citation} (m)',

  'Command composer': 'Befehlsbaukasten',
  'Command': 'Befehl',
  'Clear': 'Leeren',
  'Command cleared.': 'Befehl geleert.',
  'Value for {flag} ({name})': 'Wert für {flag} ({name})',
  'Optional value for {flag} ({name})': 'Optionaler Wert für {flag} ({name})',
  'Fill in {missing} to copy.': 'Zum Kopieren {missing} ausfüllen.',
  'add': 'hinzufügen',
  'remove': 'entfernen',
  'Add {flag} to the command': '{flag} zum Befehl hinzufügen',
  'Remove {flag} from the command': '{flag} aus dem Befehl entfernen',
  'Added {flag}. {warnings}': '{flag} hinzugefügt. {warnings}',
  'Removed {flag}.': '{flag} entfernt.',
  'Choose one mode: {modes} conflict.': 'Nur einen Modus wählen: {modes} schließen sich aus.',
  '{flag}: {words}.': '{flag}: {words}.',

  'Find in page…': 'In der Seite suchen …',
  'Previous match': 'Vorheriger Treffer',
  'Next match': 'Nächster Treffer',
  'Close find': 'Suche schließen',
  'Match {index} of {count}': 'Treffer {index} von {count}',

  'Highlighting {terms}': 'Hervorgehoben: {terms}',
  'options.clear\u0004Clear': 'Aufheben',
  '{shown} of {total}': '{shown} von {total}',

  'Preview unavailable right now.': 'Vorschau derzeit nicht verfügbar.',
  'No page by this name in this edition.': 'In dieser Ausgabe gibt es keine Seite mit diesem Namen.',

  'Find a row': 'Zeile suchen',
  'Find a row in {table}': 'Zeile suchen in {table}',
  'table {n}': 'Tabelle {n}',
  'Original order': 'Ursprüngliche Reihenfolge',
  'Sort by this column': 'Nach dieser Spalte sortieren',
  '{count, plural, one {# row} other {# rows}}': '{count, plural, one {# Zeile} other {# Zeilen}}',
}

export const man: Record<ManKey, string> = { ...common, ...own }
