import type { ManKey, CommonKey } from '../en/man'
import { common } from './common'

const own: Record<Exclude<ManKey, CommonKey>, string> = {
  'Link copied': 'Link copiado',
  'Copied': 'Copiado',
  'Bookmarked {citation}.': '{citation} adicionado aos favoritos.',
  'Removed bookmark for {citation}.': 'Favorito de {citation} removido.',
  'man.bookmarkRemoveLabel\u0004Remove bookmark for {citation}': 'Favorito: remover {citation}',
  'Bookmarked: {citation} (m)': 'Nos favoritos: {citation} (m)',

  'Command composer': 'Compositor de comandos',
  'Command': 'Comando',
  'Clear': 'Limpar',
  'Command cleared.': 'Comando limpo.',
  'Value for {flag} ({name})': 'Valor de {flag} ({name})',
  'Optional value for {flag} ({name})': 'Valor opcional de {flag} ({name})',
  'Fill in {missing} to copy.': 'Preencha {missing} para copiar.',
  'add': 'adicionar',
  'remove': 'remover',
  'Add {flag} to the command': 'Adicionar {flag} ao comando',
  'Remove {flag} from the command': 'Remover {flag} do comando',
  'Added {flag}. {warnings}': '{flag} adicionado. {warnings}',
  'Removed {flag}.': '{flag} removido.',
  'Choose one mode: {modes} conflict.': 'Escolha apenas um modo: {modes} são incompatíveis.',
  '{flag}: {words}.': '{flag}: {words}.',

  'Find in page…': 'Localizar na página…',
  'Previous match': 'Correspondência anterior',
  'Next match': 'Próxima correspondência',
  'Close find': 'Fechar o Localizar',
  'Match {index} of {count}': 'Correspondência {index} de {count}',

  'Highlighting {terms}': 'Destacando {terms}',
  'options.clear\u0004Clear': 'Limpar',
  '{shown} of {total}': '{shown} de {total}',

  'Preview unavailable right now.': 'Pré-visualização indisponível no momento.',
  'No page by this name in this edition.': 'Não há página com este nome nesta edição.',

  'Find a row': 'Localizar uma linha',
  'Find a row in {table}': 'Localizar uma linha em {table}',
  'table {n}': 'tabela {n}',
  'Original order': 'Ordem original',
  'Sort by this column': 'Ordenar por esta coluna',
  '{count, plural, one {# row} other {# rows}}': '{count, plural, one {# linha} other {# linhas}}',
}

export const man: Record<ManKey, string> = { ...common, ...own }
