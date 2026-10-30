import type { ManKey, CommonKey } from '../en/man'
import { common } from './common'

const own: Record<Exclude<ManKey, CommonKey>, string> = {
  'Link copied': 'Enlace copiado',
  'Copied': 'Copiado',
  'Bookmarked {citation}.': '{citation} añadido a marcadores.',
  'Removed bookmark for {citation}.': 'Marcador de {citation} quitado.',
  'man.bookmarkRemoveLabel\u0004Remove bookmark for {citation}': 'Marcador: quitar {citation}',
  'Bookmarked: {citation} (m)': 'En marcadores: {citation} (m)',

  'Command composer': 'Compositor de comandos',
  'Command': 'Comando',
  'Clear': 'Borrar',
  'Command cleared.': 'Comando borrado.',
  'Value for {flag} ({name})': 'Valor de {flag} ({name})',
  'Optional value for {flag} ({name})': 'Valor opcional de {flag} ({name})',
  'Fill in {missing} to copy.': 'Rellena {missing} para copiar.',
  'add': 'añadir',
  'remove': 'quitar',
  'Add {flag} to the command': 'Añadir {flag} al comando',
  'Remove {flag} from the command': 'Quitar {flag} del comando',
  'Added {flag}. {warnings}': '{flag} añadido. {warnings}',
  'Removed {flag}.': '{flag} quitado.',
  'Choose one mode: {modes} conflict.': 'Elige un solo modo: {modes} son incompatibles.',
  '{flag}: {words}.': '{flag}: {words}.',

  'Find in page…': 'Buscar en la página…',
  'Previous match': 'Coincidencia anterior',
  'Next match': 'Coincidencia siguiente',
  'Close find': 'Cerrar la búsqueda',
  'Match {index} of {count}': 'Coincidencia {index} de {count}',

  'Highlighting {terms}': 'Resaltado: {terms}',
  'options.clear\u0004Clear': 'Quitar',
  '{shown} of {total}': '{shown} de {total}',

  'Preview unavailable right now.': 'Vista previa no disponible por ahora.',
  'No page by this name in this edition.': 'No hay ninguna página con este nombre en esta edición.',

  'Find a row': 'Buscar una fila',
  'Find a row in {table}': 'Buscar una fila en {table}',
  'table {n}': 'tabla {n}',
  'Original order': 'Orden original',
  'Sort by this column': 'Ordenar por esta columna',
  '{count, plural, one {# row} other {# rows}}': '{count, plural, one {# fila} other {# filas}}',
}

export const man: Record<ManKey, string> = { ...common, ...own }
