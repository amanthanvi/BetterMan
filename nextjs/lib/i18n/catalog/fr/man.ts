import type { ManKey, CommonKey } from '../en/man'
import { common } from './common'

const own: Record<Exclude<ManKey, CommonKey>, string> = {
  'Link copied': 'Lien copié',
  'Copied': 'Copié',
  'Bookmarked {citation}.': '{citation} ajouté aux favoris.',
  'Removed bookmark for {citation}.': '{citation} retiré des favoris.',
  'man.bookmarkRemoveLabel\u0004Remove bookmark for {citation}': 'Favori : retirer {citation}',
  'Bookmarked: {citation} (m)': 'Dans les favoris : {citation} (m)',

  'Command composer': 'Constructeur de commande',
  'Command': 'Commande',
  'Clear': 'Effacer',
  'Command cleared.': 'Commande effacée.',
  'Value for {flag} ({name})': 'Valeur pour {flag} ({name})',
  'Optional value for {flag} ({name})': 'Valeur facultative pour {flag} ({name})',
  'Fill in {missing} to copy.': 'Renseignez {missing} pour copier.',
  'add': 'ajouter',
  'remove': 'retirer',
  'Add {flag} to the command': 'Ajouter {flag} à la commande',
  'Remove {flag} from the command': 'Retirer {flag} de la commande',
  'Added {flag}. {warnings}': '{flag} ajouté. {warnings}',
  'Removed {flag}.': '{flag} retiré.',
  'Choose one mode: {modes} conflict.': 'Choisissez un seul mode : {modes} sont incompatibles.',
  '{flag}: {words}.': '{flag} : {words}.',

  'Find in page…': 'Rechercher dans la page…',
  'Previous match': 'Correspondance précédente',
  'Next match': 'Correspondance suivante',
  'Close find': 'Fermer la recherche',
  'Match {index} of {count}': 'Correspondance {index} sur {count}',

  'Highlighting {terms}': 'Mise en évidence : {terms}',
  'options.clear\u0004Clear': 'Effacer',
  '{shown} of {total}': '{shown} sur {total}',

  'Preview unavailable right now.': 'Aperçu indisponible pour le moment.',
  'No page by this name in this edition.': 'Aucune page de ce nom dans cette édition.',

  'Find a row': 'Chercher une ligne',
  'Find a row in {table}': 'Chercher une ligne dans {table}',
  'table {n}': 'tableau {n}',
  'Original order': 'Ordre d’origine',
  'Sort by this column': 'Trier selon cette colonne',
  '{count, plural, one {# row} other {# rows}}': '{count, plural, one {# ligne} other {# lignes}}',
}

export const man: Record<ManKey, string> = { ...common, ...own }
