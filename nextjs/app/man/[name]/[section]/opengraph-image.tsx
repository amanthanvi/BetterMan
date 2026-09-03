import { OG_SIZE, ogCard } from '../../../../lib/og/card'
import { fetchManMetaByNameAndSection, withDistroFallback } from '../../../../lib/api'
import { sectionLabel } from '../../../../components/man/RunningHead'

export const alt = 'Man page'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ name: string; section: string }> }) {
  const { name, section } = await params
  let title = `${name}(${section})`
  let description = ''
  try {
    const { data } = await withDistroFallback('debian', (distro) =>
      fetchManMetaByNameAndSection({ distro, name: name.toLowerCase(), section }),
    )
    title = `${data.page.name}(${data.page.section})`
    description = data.page.description || data.page.title
  } catch {
    description = 'Not in the current dataset.'
  }

  return ogCard({
    head: title.toUpperCase(),
    label: sectionLabel(section),
    name: title,
    description,
  })
}
