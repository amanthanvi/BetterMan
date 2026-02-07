export default async function ManByNamePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
      <p className="mt-2 text-sm text-[color:var(--bm-muted)]">TODO: migrate /man/[name] route.</p>
    </div>
  )
}
