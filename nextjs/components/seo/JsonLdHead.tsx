'use client'

import { useServerInsertedHTML } from 'next/navigation'

export function JsonLdHead({ id, nonce, jsonLd }: { id: string; nonce?: string; jsonLd: string }) {
  useServerInsertedHTML(() => (
    <script id={id} type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLd }} />
  ))

  return null
}

