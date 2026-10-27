import { ManNotFound } from '../../../components/man/ManNotFound'
import { MISSING_MAN_METADATA, requestedManMiss } from '../../../lib/manLookup'

export const metadata = MISSING_MAN_METADATA

export default async function NotFound() {
  // The page's own lookup reports a failure; this one only decides whether to render.
  const miss = await requestedManMiss().catch(() => null)
  return miss ? <ManNotFound miss={miss} /> : null
}
