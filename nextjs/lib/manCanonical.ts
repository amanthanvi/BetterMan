import { canonicalWithDistro, type Distro } from './distro'
import type { ManPageResponse } from './docModel'

/** Distinct alternates keep their URL; winners and identical content canonicalize clean. */
export function manCanonicalPath({ page, providers }: ManPageResponse, distro: Distro, pkg?: string | null): string {
  const path = canonicalWithDistro(`/man/${encodeURIComponent(page.name)}/${encodeURIComponent(page.section)}`, distro)
  if (!providers || providers.sameAsDefault) return path
  const selected = pkg ?? (providers.defaultPackage !== page.sourcePackage ? page.sourcePackage : null)
  return selected && selected !== providers.defaultPackage
    ? `${path}${path.includes('?') ? '&' : '?'}pkg=${encodeURIComponent(selected)}`
    : path
}
