export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-semibold tracking-tight">Section {section}</h1>
      <p className="mt-2 text-sm text-[color:var(--bm-muted)]">TODO: migrate section browse route.</p>
    </div>
  )
}
