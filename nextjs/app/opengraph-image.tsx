import { OG_SIZE, ogCard } from '../lib/og/card'

export const alt = 'BetterMan'
export const size = OG_SIZE
export const contentType = 'image/png'
export const dynamic = 'force-static'
export const revalidate = 86400

export default async function Image() {
  const response = await ogCard({
    head: 'BETTERMAN(1)',
    label: 'User Commands',
    name: 'betterman',
    description: 'Unix manual pages, typeset for the screen.',
  })
  // ImageResponse's default header asks caches to revalidate every request,
  // even when Next prerenders this route. Match the daily ISR boundary at CDN.
  response.headers.set('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800')
  return response
}
