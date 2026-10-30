import type { AppProps } from 'next/app'

import '../app/globals.css'

/** The Pages Router serves the man pages and concept explainers, as plain HTML with no Next runtime (see pages/man, pages/concept). */
export default function ManApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
