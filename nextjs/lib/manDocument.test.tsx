import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { ANALYTICS_BOOT_SCRIPT } from './analyticsBoot'
import ManDocument from '../pages/_document'

vi.mock('next/document', () => ({
  Html: ({ children }: { children: React.ReactNode }) => <html>{children}</html>,
  Head: ({ children }: { children: React.ReactNode }) => createElement('head', null, children),
  Main: () => <main />,
  NextScript: () => null,
}))

afterEach(() => vi.unstubAllEnvs())
const render = () => renderToStaticMarkup(<ManDocument __NEXT_DATA__={{ props: { pageProps: {} }, page: '/man/tar/1', query: {}, buildId: 'test' }} />)

it('renders only the fixed bootstrap in head without a nonce in production', () => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics: { scriptSrc: '/project-intake/script.js', eventEndpoint: '/project-intake/event', viewEndpoint: '/project-intake/view' } }))
  const html = render()
  expect(html.split('</head>')[0]).toContain(`<script data-script-src="/project-intake/script.js" data-event-endpoint="/project-intake/event" data-view-endpoint="/project-intake/view">${ANALYTICS_BOOT_SCRIPT}</script>`)
  expect(html).not.toContain('<script defer=')
  expect(html).not.toMatch(/<script[^>]* nonce=/)
})

it.each(['preview', 'development', ''])('emits no analytics outside Vercel production (%s)', (env) => {
  vi.stubEnv('VERCEL_ENV', env)
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics: { scriptSrc: '/project-intake/script.js' } }))
  expect(render()).not.toContain('window.va=')
  expect(render()).not.toContain('/project-intake/')
})

it('emits no analytics in production until project configuration is available', () => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', '')
  expect(render()).not.toContain('window.va=')
})
