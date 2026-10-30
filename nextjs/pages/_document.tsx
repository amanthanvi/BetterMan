import { Head, Html, Main, NextScript, type DocumentProps } from 'next/document'

import { ManHeadTags, type ManHeadData } from '../components/man/ManHead'
import { MAN_BOOT_SCRIPT } from '../lib/manBoot'

/**
 * The man pages' document. Next's runtime is off for these pages
 * (`unstable_runtimeJS: false`), so the only inline script is the boot script,
 * which the proxy's CSP allows by hash. No nonce: the HTML is cached at the edge.
 */
export default function ManDocument(props: DocumentProps) {
  const head = (props.__NEXT_DATA__.props as { pageProps?: { head?: ManHeadData } } | undefined)?.pageProps?.head
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()
  return (
    <Html lang="en">
      <Head>
        {head ? <ManHeadTags {...head} /> : null}
        <script dangerouslySetInnerHTML={{ __html: MAN_BOOT_SCRIPT }} />
        {/* The manual's roman, Latin range. Other ranges and the italic load when a page uses them. */}
        <link rel="preload" href="/fonts/bm-text/bm-text-roman-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="search" type="application/opensearchdescription+xml" title="BetterMan" href="/opensearch.xml" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
        {plausibleDomain ? <script defer src="/assets/site.js" data-api="/assets/entry" data-domain={plausibleDomain} /> : null}
      </body>
    </Html>
  )
}
