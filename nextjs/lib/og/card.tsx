import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ImageResponse } from 'next/og'

export const OG_SIZE = { width: 1200, height: 630 }

/* Paper and ink from globals.css. Light scheme only: share cards render once. */
const PAPER = '#faf8f5'
const INK = '#1c1a17'
const MUTED = '#6f695f'
const EDGE = '#cfc8bc'
const ACCENT = '#c22126'

let fontsPromise: Promise<{ sans: ArrayBuffer; mono: ArrayBuffer; monoBold: ArrayBuffer }> | null = null

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/* Static instances of the site fonts (public/fonts/og); satori cannot read
   variable fonts or WOFF2. Regenerate with fonttools varLib.instancer. */
function loadFonts() {
  if (!fontsPromise) {
    const root = join(process.cwd(), 'public', 'fonts', 'og')
    fontsPromise = Promise.all([
      readFile(join(root, 'Geist-Regular.ttf')),
      readFile(join(root, 'JetBrainsMono-Regular.ttf')),
      readFile(join(root, 'JetBrainsMono-SemiBold.ttf')),
    ]).then(([sans, mono, monoBold]) => ({
      sans: toArrayBuffer(sans),
      mono: toArrayBuffer(mono),
      monoBold: toArrayBuffer(monoBold),
    }))
  }
  return fontsPromise
}

/**
 * A share card in the running-head grammar: three-part head over a hairline,
 * NAME line, one-line description. Square edges, no chrome.
 */
export async function ogCard(opts: { head: string; label: string; name: string; description: string }) {
  const fonts = await loadFonts()
  const description = opts.description.length > 120 ? `${opts.description.slice(0, 117)}…` : opts.description

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: PAPER,
          color: INK,
          padding: '72px 88px',
          fontFamily: 'Geist',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'JetBrains Mono',
            fontSize: 28,
            letterSpacing: '0.04em',
            color: MUTED,
            paddingBottom: 20,
            borderBottom: `2px solid ${EDGE}`,
          }}
        >
          <span>{opts.head}</span>
          <span>{opts.label}</span>
          <span>{opts.head}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 96, gap: 28 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 26, letterSpacing: '0.08em', color: MUTED }}>NAME</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, paddingLeft: 48 }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 72, fontWeight: 600, letterSpacing: '-0.02em' }}>
              {opts.name}
            </span>
            <span style={{ fontSize: 40, color: MUTED }}>—</span>
            <span style={{ fontSize: 40, color: INK, lineHeight: 1.3, maxWidth: 760 }}>{description}</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
            alignItems: 'center',
            gap: 14,
            fontFamily: 'JetBrains Mono',
            fontSize: 26,
            color: MUTED,
          }}
        >
          <span style={{ color: ACCENT, fontWeight: 700 }}>&gt;_</span>
          <span>betterman.sh</span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Geist', data: fonts.sans, style: 'normal', weight: 400 },
        { name: 'JetBrains Mono', data: fonts.mono, style: 'normal', weight: 400 },
        { name: 'JetBrains Mono', data: fonts.monoBold, style: 'normal', weight: 600 },
      ],
    },
  )
}
