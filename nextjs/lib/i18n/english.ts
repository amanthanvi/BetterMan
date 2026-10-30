import { makeT } from './translate'
import type { ServerT } from './server'

/**
 * English, synchronously, for output that is not translated by design: the
 * plain-text export (a terminal manual, as upstream wrote it) and share images.
 * Server code only; the browser bundles take their English from the client catalog.
 */
export const tEnglish: ServerT = makeT('en', null)
