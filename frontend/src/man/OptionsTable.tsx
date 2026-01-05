import type { OptionItem } from '../api/types'

export function OptionsTable({ options }: { options: OptionItem[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)]">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-[color:var(--bm-bg)/0.7] text-[color:var(--bm-muted)]">
          <tr>
            <th className="w-[28ch] border-b border-[var(--bm-border)] px-3 py-2 font-medium">
              Flag
            </th>
            <th className="border-b border-[var(--bm-border)] px-3 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {options.map((opt) => (
            <tr key={opt.anchorId} className="odd:bg-[color:var(--bm-bg)/0.35]">
              <td className="border-b border-[var(--bm-border)] px-3 py-2 align-top font-mono text-[color:var(--bm-fg)]">
                <a href={`#${opt.anchorId}`} className="no-underline hover:underline">
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

