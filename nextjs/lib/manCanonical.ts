import { canonicalWithDistro, type Distro } from './distro'
import type { ManPageResponse } from './docModel'

/** Provider-aware paths for indexable canonical declarations and share images. */
export function manCanonicalPath({ page, providers }: ManPageResponse, distro: Distro, pkg?: string | null): string {
  const path = canonicalWithDistro(`/man/${encodeURIComponent(page.name)}/${encodeURIComponent(page.section)}`, distro)
  if (!providers || providers.sameAsDefault) return path
  const selected = pkg ?? (providers.defaultPackage !== page.sourcePackage ? page.sourcePackage : null)
  return selected && selected !== providers.defaultPackage
    ? `${path}${path.includes('?') ? '&' : '?'}pkg=${encodeURIComponent(selected)}`
    : path
}
