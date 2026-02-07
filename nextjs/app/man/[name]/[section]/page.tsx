export default async function ManByNameAndSectionPage({
  params,
}: {
  params: Promise<{ name: string; section: string }>
}) {
  const { name, section } = await params
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-semibold tracking-tight">
        {name}({section})
      </h1>
      <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
        TODO: migrate /man/[name]/[section] route.
      </p>
    </div>
  )
}
