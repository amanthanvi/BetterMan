import { canonicalWithDistro, type Distro } from './distro'
import type { ManPageResponse } from './docModel'

/** Different manuals index independently; an explicit winning package is a duplicate. */
export function manCanonicalPath({ page, providers }: ManPageResponse, distro: Distro, pkg?: string | null): string {
  const path = canonicalWithDistro(`/man/${encodeURIComponent(page.name)}/${encodeURIComponent(page.section)}`, distro)
  const selected = pkg ?? (providers && providers.defaultPackage !== page.sourcePackage ? page.sourcePackage : null)
  return selected && selected !== providers?.defaultPackage
    ? `${path}${path.includes('?') ? '&' : '?'}pkg=${encodeURIComponent(selected)}`
    : path
}
