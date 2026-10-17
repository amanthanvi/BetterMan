'use client'

import { useLinkStatus } from 'next/link'

// Marks its parent <Link> while the navigation is pending. Man and section
// routes have no loading boundary (their status code is settled before anything
// streams), so without this a click shows nothing until the payload lands.
export function LinkPendingHint() {
  const { pending } = useLinkStatus()
  return <span hidden data-bm-link-pending={pending ? '' : undefined} />
}
