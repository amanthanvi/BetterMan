import type { ManKey, CommonKey } from '../en/man'
import { common } from './common'

const own: Record<Exclude<ManKey, CommonKey>, string> = {
  'Link copied': 'リンクをコピーしました',
  'Copied': 'コピーしました',
  'Bookmarked {citation}.': '{citation} をブックマークしました。',
  'Removed bookmark for {citation}.': '{citation} のブックマークを削除しました。',
  'man.bookmarkRemoveLabel\u0004Remove bookmark for {citation}': '{citation} のブックマークを削除',
  'Bookmarked: {citation} (m)': 'ブックマーク済み: {citation} (m)',

  'Command composer': 'コマンドコンポーザー',
  'Command': 'コマンド',
  'Clear': 'クリア',
  'Command cleared.': 'コマンドをクリアしました。',
  'Value for {flag} ({name})': '{flag} の値 ({name})',
  'Optional value for {flag} ({name})': '{flag} の任意の値 ({name})',
  'Fill in {missing} to copy.': 'コピーするには {missing} を入力してください。',
  'add': '追加',
  'remove': '削除',
  'Add {flag} to the command': '{flag} をコマンドに追加',
  'Remove {flag} from the command': '{flag} をコマンドから削除',
  'Added {flag}. {warnings}': '{flag} を追加しました。{warnings}',
  'Removed {flag}.': '{flag} を削除しました。',
  'Choose one mode: {modes} conflict.': 'モードは1つだけ選んでください: {modes} は同時に使えません。',
  '{flag}: {words}.': '{flag}: {words}。',

  'Find in page…': 'ページ内を検索…',
  'Previous match': '前の一致',
  'Next match': '次の一致',
  'Close find': '検索を閉じる',
  'Match {index} of {count}': '{count}件中{index}件目の一致',

  'Highlighting {terms}': 'ハイライト: {terms}',
  'options.clear\u0004Clear': '解除',
  '{shown} of {total}': '{total}件中{shown}件',

  'Preview unavailable right now.': '現在プレビューを表示できません。',
  'No page by this name in this edition.': 'この版にこの名前のページはありません。',

  'Find a row': '行を検索',
  'Find a row in {table}': '{table}内の行を検索',
  'table {n}': '表{n}',
  'Original order': '元の順序',
  'Sort by this column': 'この列で並べ替え',
  '{count, plural, one {# row} other {# rows}}': '{count, plural, other {#行}}',
}

export const man: Record<ManKey, string> = { ...common, ...own }
