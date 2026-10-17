'use client'

import { useServerInsertedHTML } from 'next/navigation'
import { useRef } from 'react'

export function JsonLdHead({ id, nonce, jsonLd }: { id: string; nonce?: string; jsonLd: string }) {
  // Next calls this on every flush of the stream; the first one lands in <head>.
  const inserted = useRef(false)
  useServerInsertedHTML(() => {
    if (inserted.current) return null
    inserted.current = true
    return <script id={id} type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLd }} />
  })

  return null
}

