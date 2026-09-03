import { OG_SIZE, ogCard } from '../lib/og/card'

export const alt = 'BetterMan'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return ogCard({
    head: 'BETTERMAN(1)',
    label: 'User Commands',
    name: 'betterman',
    description: 'Unix manual pages, typeset for the screen.',
  })
}
