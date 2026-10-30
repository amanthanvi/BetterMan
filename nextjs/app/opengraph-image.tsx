import { OG_SIZE, ogCard } from '../lib/og/card'

export const alt = 'betterman(1): the Unix manual, typeset for the screen'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return ogCard({
    name: 'betterman',
    section: '1',
    label: 'User Commands',
    description: 'the Unix manual, typeset for the screen',
  })
}
