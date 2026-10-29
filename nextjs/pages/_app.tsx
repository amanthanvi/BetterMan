import type { AppProps } from 'next/app'

import '../app/globals.css'

/** The Pages Router serves only the man pages, as plain HTML with no Next runtime (see pages/man). */
export default function ManApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
