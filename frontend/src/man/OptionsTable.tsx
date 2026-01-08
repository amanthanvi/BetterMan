import type { OptionItem } from '../api/types'

export function OptionsTable({
  options,
  selectedAnchorId,
  onSelect,
}: {
  options: OptionItem[]
  selectedAnchorId?: string | null
  onSelect?: (opt: OptionItem) => void
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] shadow-sm">
      <table className="w-full border-collapse text-left text-[15px]">
        <thead className="bg-[color:var(--bm-bg)/0.6] text-[color:var(--bm-muted)]">
          <tr>
            <th className="w-[28ch] border-b border-[var(--bm-border)] px-3 py-2 font-medium">
              Flag
            </th>
            <th className="border-b border-[var(--bm-border)] px-3 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {options.map((opt) => (
            <tr
              key={opt.anchorId}
              className={`odd:bg-[color:var(--bm-bg)/0.25] ${
                selectedAnchorId === opt.anchorId ? 'bg-[color:var(--bm-accent)/0.12]' : ''
              }`}
            >
              <td className="border-b border-[var(--bm-border)] px-3 py-2 align-top font-mono text-[color:var(--bm-fg)]">
                <a
                  href={`#${opt.anchorId}`}
                  className="no-underline hover:underline"
                  onClick={() => onSelect?.(opt)}
                >
                  {opt.flags}
                  {opt.argument ? <span className="text-[color:var(--bm-muted)]"> {opt.argument}</span> : null}
                </a>
              </td>
              <td className="border-b border-[var(--bm-border)] px-3 py-2 text-[color:var(--bm-muted)]">
                {opt.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
