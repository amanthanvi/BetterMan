import type { ServerT } from '../../lib/i18n/server'

export type ManHeadData = {
  title: string
  description: string | null
  canonical: string | null
  ogImage: { url: string; width: number; height: number; alt: string } | null
  /** Already escaped for a script context by safeJsonLdStringify. */
  jsonLd: { id: string; json: string } | null
  noindex: boolean
  /** A shared flag's title and definition for the share tags; the document keeps the page's own. */
  share?: { title: string; description: string }
  /** The printed running head (left, centre, right) and foot (left, centre); the page number ends the foot. */
  print?: { head: [string, string, string]; foot: [string, string] }
}

/** A CSS string literal that cannot end the string, the rule or the <style> element. */
export function cssString(value: string): string {
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[\\"<]/g, (ch) => `\\${ch.charCodeAt(0).toString(16)} `)
  return `"${text}"`
}

/** The page's running head and foot as page-margin content (globals.css styles the boxes). */
export function printPageCss({ head, foot }: NonNullable<ManHeadData['print']>): string {
  const boxes: Array<[string, string]> = [
    ['top-left', head[0]],
    ['top-center', head[1]],
    ['top-right', head[2]],
    ['bottom-left', foot[0]],
    ['bottom-center', foot[1]],
  ]
  return `@page{${boxes.map(([box, text]) => `@${box}{content:${cssString(text)}}`).join('')}}`
}

/** Every man page route returns its head as `pageProps.head`; pages/_document.tsx renders it. */
export function missingManHead(t: ServerT): ManHeadData {
  return { title: t('{title} — BetterMan', { title: t('Not found') }), description: null, canonical: null, ogImage: null, jsonLd: null, noindex: true }
}

/**
 * The man pages' <head> metadata, which the App Router's metadata API writes
 * for every other page. The document renders it (not next/head), so the tags
 * carry no framework attributes. JSON-LD is a data block, not a script the
 * browser runs, so it needs no nonce: the HTML is cached at the edge.
 */
export function ManHeadTags({ title, description, canonical, ogImage, jsonLd, noindex, share, print }: ManHeadData) {
  const shareTitle = share?.title ?? title
  const shareDescription = share?.description ?? description
  return (
    <>
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      {noindex ? <meta name="robots" content="noindex" /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      <meta property="og:title" content={shareTitle} />
      {shareDescription ? <meta property="og:description" content={shareDescription} /> : null}
      <meta property="og:type" content={ogImage ? 'article' : 'website'} />
      {ogImage ? (
        <>
          <meta property="og:image" content={ogImage.url} />
          <meta property="og:image:width" content={String(ogImage.width)} />
          <meta property="og:image:height" content={String(ogImage.height)} />
          <meta property="og:image:alt" content={ogImage.alt} />
          <meta property="og:image:type" content="image/png" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:image" content={ogImage.url} />
        </>
      ) : (
        <meta name="twitter:card" content="summary" />
      )}
      <meta name="twitter:title" content={shareTitle} />
      {shareDescription ? <meta name="twitter:description" content={shareDescription} /> : null}
      {print ? <style dangerouslySetInnerHTML={{ __html: printPageCss(print) }} /> : null}
      {jsonLd ? <script id={jsonLd.id} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd.json }} /> : null}
    </>
  )
}
