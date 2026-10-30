import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ImageResponse } from 'next/og'

import { plainOgText, truncateOgText } from './input'
import { OG_SIZE } from './size'

export { OG_SIZE }

/* The light plate from globals.css. Share cards render once, so light only. */
const PAPER = '#f9f7f2'
const INK = '#1c1a16'
const INK_2 = '#55504a'
const INK_3 = '#6e685d'
const RULE = '#e4dfd4'
const ACCENT = '#a3261b'

type Fonts = Record<'roman' | 'semibold' | 'italic' | 'caps' | 'mono' | 'monoBold', ArrayBuffer>

let fontsPromise: Promise<Fonts> | null = null

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/* Static WOFF instances (public/fonts/og, scripts/fonts/build-og-fonts.py): satori reads
   neither variable fonts, WOFF2 nor OpenType features, so old-style figures and small
   caps are baked into the character maps, and no file carries a ligature. */
function loadFonts(): Promise<Fonts> {
  if (!fontsPromise) {
    const root = join(process.cwd(), 'public', 'fonts', 'og')
    fontsPromise = Promise.all([
      readFile(join(root, 'bm-text-og-roman.woff')),
      readFile(join(root, 'bm-text-og-semibold.woff')),
      readFile(join(root, 'bm-text-og-italic.woff')),
      readFile(join(root, 'bm-text-og-caps.woff')),
      readFile(join(root, 'jetbrains-mono-og-regular.woff')),
      readFile(join(root, 'jetbrains-mono-og-semibold.woff')),
    ]).then(([roman, semibold, italic, caps, mono, monoBold]) => ({
      roman: toArrayBuffer(roman),
      semibold: toArrayBuffer(semibold),
      italic: toArrayBuffer(italic),
      caps: toArrayBuffer(caps),
      mono: toArrayBuffer(mono),
      monoBold: toArrayBuffer(monoBold),
    }))
  }
  return fontsPromise
}

export type OgCardInput = {
  /** name(section), e.g. tar(1); the running head sets it in capitals. */
  name: string
  section: string
  label: string
  /** The NAME line, upstream text. */
  description?: string
  /** BetterMan's generated summary, shown only without a NAME line, with its label. */
  generated?: { text: string; label: string }
  /** One option of the manual: its terms, argument and description, upstream text. */
  option?: { flags: string; argument?: string | null; description: string }
  /** The distro and the release date, named in the running foot. */
  distro?: string
  date?: string
}

/* Satori's baseline alignment misses by a few pixels, so the title's two sizes align their
   line boxes' bottoms instead: with BM Text's ascent 1.036 and descent 0.335, a line box
   ends (lineHeight − 0.701) / 2 em under the baseline, so the section's line height makes
   that distance equal the name's. */
const TITLE_LINE = 1.05
const SECTION_SCALE = 0.45
const SECTION_LINE = 0.701 + (TITLE_LINE - 0.701) / SECTION_SCALE

/* The title stays on one line: a long name steps down, and past 40 characters it is cut. */
const TITLE_CHARS = 40

function titleSize(length: number, option: boolean): number {
  if (option) return length <= 18 ? 60 : 44
  if (length <= 10) return 132
  if (length <= 16) return 104
  if (length <= 22) return 80
  if (length <= 30) return 60
  return 44
}

/**
 * A share card set like a page of the manual: the running head TAR(1) · User
 * Commands · TAR(1) over a hairline, the name in the serif with its section in
 * old-style figures, the NAME line as an italic lede, and a running foot that
 * names the distro and the release date beside the betterman(1) wordmark. A
 * per-flag card sets the option term in bold mono, marked in the gutter with
 * the one red (the contents marker), over its definition. Every string is
 * plain text; generated text carries its label.
 */
export async function ogCard(input: OgCardInput) {
  const fonts = await loadFonts()
  const section = truncateOgText(plainOgText(input.section), 10)
  const name = truncateOgText(plainOgText(input.name), TITLE_CHARS - section.length - 2)
  const head = truncateOgText(`${name.toUpperCase()}(${section.toUpperCase()})`, 24)
  // As on a phone, a long head drops its middle rather than crowd it.
  const label = head.length > 14 ? '' : truncateOgText(plainOgText(input.label), 40)
  const option = input.option
    ? {
        flags: truncateOgText(plainOgText(input.option.flags), 60),
        argument: input.option.argument ? truncateOgText(plainOgText(input.option.argument), 30) : '',
        description: truncateOgText(plainOgText(input.option.description), 260),
      }
    : null
  const description = input.description ? truncateOgText(plainOgText(input.description), 140) : ''
  const generated =
    !description && !option && input.generated
      ? { text: truncateOgText(plainOgText(input.generated.text), 220), label: truncateOgText(plainOgText(input.generated.label), 70) }
      : null
  const foot = [input.distro, input.date].filter(Boolean).map((part) => plainOgText(part!)).join(' · ')
  const size = titleSize([...name].length + section.length + 2, Boolean(option))
  // A flag term past one line at 56px steps down, and its definition gives up a line.
  const longFlags = option ? [...option.flags].length + [...option.argument].length > 28 : false
  const marker = { position: 'absolute', left: -36, width: 4, background: ACCENT } as const

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
          padding: '52px 80px 50px',
          fontFamily: 'BM Text',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'BM Text Caps',
            fontSize: 30,
            letterSpacing: '0.08em',
            color: INK_3,
            paddingBottom: 16,
            borderBottom: `2px solid ${RULE}`,
          }}
        >
          <span>{head}</span>
          {label ? <span>{label}</span> : null}
          <span>{head}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: option ? 44 : 60, position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              whiteSpace: 'nowrap',
              fontSize: size,
              fontWeight: 600,
              lineHeight: TITLE_LINE,
              letterSpacing: '-0.02em',
              position: 'relative',
            }}
          >
            {option ? null : <div style={{ ...marker, top: size * 0.22, height: size * 0.62 }} />}
            <span>{name}</span>
            <span style={{ fontWeight: 400, fontSize: size * SECTION_SCALE, lineHeight: SECTION_LINE, color: INK_3, letterSpacing: 0, marginLeft: size * 0.04 }}>
              ({section})
            </span>
          </div>

          {option ? (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', position: 'relative', fontFamily: 'JetBrains Mono', fontSize: longFlags ? 40 : 56, lineHeight: 1.2 }}>
                <div style={{ ...marker, top: longFlags ? 10 : 14, height: longFlags ? 33 : 46 }} />
                <span style={{ fontWeight: 600 }}>{option.flags}</span>
                {option.argument ? <span style={{ color: INK_2, marginLeft: 20 }}>{option.argument}</span> : null}
              </div>
              <div style={{ display: 'block', marginTop: 20, fontSize: 34, lineHeight: 1.4, color: INK, lineClamp: longFlags ? 2 : 3 }}>{option.description}</div>
            </div>
          ) : description ? (
            <div style={{ display: 'block', marginTop: 16, fontStyle: 'italic', fontSize: 42, lineHeight: 1.3, color: INK_2, lineClamp: 2 }}>
              {description}
            </div>
          ) : generated ? (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22 }}>
              <div style={{ display: 'block', fontSize: 36, lineHeight: 1.4, color: INK, lineClamp: 3 }}>{generated.text}</div>
              <div style={{ display: 'flex', marginTop: 12, fontSize: 26, color: INK_3 }}>
                {generated.label}
              </div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginTop: 'auto',
            paddingTop: 16,
            borderTop: `2px solid ${RULE}`,
          }}
        >
          <span style={{ fontFamily: 'BM Text Caps', fontSize: 30, letterSpacing: '0.08em', color: INK_3 }}>{foot}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', fontSize: 38, fontWeight: 600, letterSpacing: '-0.005em' }}>
            betterman
            <span style={{ fontWeight: 400, color: INK_3 }}>(1)</span>
          </span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'BM Text', data: fonts.roman, style: 'normal', weight: 400 },
        { name: 'BM Text', data: fonts.semibold, style: 'normal', weight: 600 },
        { name: 'BM Text', data: fonts.italic, style: 'italic', weight: 400 },
        { name: 'BM Text Caps', data: fonts.caps, style: 'normal', weight: 400 },
        { name: 'JetBrains Mono', data: fonts.mono, style: 'normal', weight: 400 },
        { name: 'JetBrains Mono', data: fonts.monoBold, style: 'normal', weight: 600 },
      ],
    },
  )
}
