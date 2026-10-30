import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { ANALYTICS_BOOT_SCRIPT, analyticsBootScriptHash } from './analyticsBoot'

type Event = { type: string; url: string }

it('registers beforeSend before the tracker loads, sanitizing pageviews and custom events', () => {
  const window = { location: { origin: 'https://betterman.sh' }, vaq: [] as unknown[][] }
  runInNewContext(ANALYTICS_BOOT_SCRIPT, { window, URL, URLSearchParams })
  expect(window.vaq).toHaveLength(1)
  expect(window.vaq[0][0]).toBe('beforeSend')
  const beforeSend = window.vaq[0][1] as (event: Event) => Event | null
  for (const type of ['pageview', 'event']) {
    const event = beforeSend({ type, url: 'https://user:secret@betterman.sh/search?q=private&cmd=secret&name=secret&pkg=x&lang=de&utm_source=hn&utm_medium=link&utm_campaign=launch&utm_content=post&utm_term=man&ref=home&source=share#secret' })
    expect(event).toEqual({ type, url: '/search?utm_source=hn&utm_medium=link&utm_campaign=launch&utm_content=post&utm_term=man&ref=home&source=share' })
  }
  expect(beforeSend({ type: 'pageview', url: '/search?q=secret#secret' })?.url).toBe('/search')
  expect(beforeSend({ type: 'pageview', url: 'http://[' })).toBeNull()
})

it('hashes the exact inline bytes the renderer sends', async () => {
  expect(await analyticsBootScriptHash()).toBe(`'sha256-${createHash('sha256').update(ANALYTICS_BOOT_SCRIPT).digest('base64')}'`)
})
