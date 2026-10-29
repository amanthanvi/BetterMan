export type ManHeadData = {
  title: string
  description: string | null
  canonical: string | null
  ogImage: { url: string; width: number; height: number; alt: string } | null
  /** Already escaped for a script context by safeJsonLdStringify. */
  jsonLd: { id: string; json: string } | null
  noindex: boolean
}

/** Every man page route returns its head as `pageProps.head`; pages/_document.tsx renders it. */
export const MISSING_MAN_HEAD: ManHeadData = { title: 'Not found — BetterMan', description: null, canonical: null, ogImage: null, jsonLd: null, noindex: true }

/**
 * The man pages' <head> metadata, which the App Router's metadata API writes
 * for every other page. The document renders it (not next/head), so the tags
 * carry no framework attributes. JSON-LD is a data block, not a script the
 * browser runs, so it needs no nonce: the HTML is cached at the edge.
 */
export function ManHeadTags({ title, description, canonical, ogImage, jsonLd, noindex }: ManHeadData) {
  return (
    <>
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      {noindex ? <meta name="robots" content="noindex" /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      <meta property="og:title" content={title} />
      {description ? <meta property="og:description" content={description} /> : null}
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
      <meta name="twitter:title" content={title} />
      {description ? <meta name="twitter:description" content={description} /> : null}
      {jsonLd ? <script id={jsonLd.id} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd.json }} /> : null}
    </>
  )
}
