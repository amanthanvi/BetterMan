import type { ManKey, CommonKey } from '../en/man'
import { common } from './common'

const own: Record<Exclude<ManKey, CommonKey>, string> = {
  'Link copied': 'Ссылка скопирована',
  'Copied': 'Скопировано',
  'Bookmarked {citation}.': '{citation} добавлено в закладки.',
  'Removed bookmark for {citation}.': 'Закладка {citation} удалена.',
  'man.bookmarkRemoveLabel\u0004Remove bookmark for {citation}': 'Закладка: удалить {citation}',
  'Bookmarked: {citation} (m)': 'В закладках: {citation} (m)',

  'Command composer': 'Конструктор команды',
  'Command': 'Команда',
  'Clear': 'Очистить',
  'Command cleared.': 'Команда очищена.',
  'Value for {flag} ({name})': 'Значение для {flag} ({name})',
  'Optional value for {flag} ({name})': 'Необязательное значение для {flag} ({name})',
  'Fill in {missing} to copy.': 'Чтобы скопировать, заполните: {missing}.',
  'add': 'добавить',
  'remove': 'убрать',
  'Add {flag} to the command': 'Добавить {flag} в команду',
  'Remove {flag} from the command': 'Убрать {flag} из команды',
  'Added {flag}. {warnings}': '{flag} добавлен. {warnings}',
  'Removed {flag}.': '{flag} убран.',
  'Choose one mode: {modes} conflict.': 'Выберите только один режим: {modes} несовместимы.',
  '{flag}: {words}.': '{flag}: {words}.',

  'Find in page…': 'Поиск по странице…',
  'Previous match': 'Предыдущее совпадение',
  'Next match': 'Следующее совпадение',
  'Close find': 'Закрыть поиск',
  'Match {index} of {count}': 'Совпадение {index} из {count}',

  'Highlighting {terms}': 'Подсвечено: {terms}',
  'options.clear\u0004Clear': 'Сбросить',
  '{shown} of {total}': '{shown} из {total}',

  'Preview unavailable right now.': 'Предпросмотр сейчас недоступен.',
  'No page by this name in this edition.': 'В этом издании нет страницы с таким названием.',

  'Find a row': 'Найти строку',
  'Find a row in {table}': 'Найти строку ({table})',
  'table {n}': 'таблица {n}',
  'Original order': 'Исходный порядок',
  'Sort by this column': 'Сортировать по этому столбцу',
  '{count, plural, one {# row} other {# rows}}': '{count, plural, one {# строка} few {# строки} many {# строк} other {# строки}}',
}

export const man: Record<ManKey, string> = { ...common, ...own }
