'use client'

import { DISTRO_GROUPS, type Distro } from '../../lib/distro'
import { useDistro } from '../state/distro'
import { useReadingPrefs } from '../state/readingPrefs'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Drawer } from '../ui/Drawer'

type SegOption<T extends string> = { id: T; label: string }

type SegmentedRadioGroupProps<T extends string> = {
  label: string
  value: T
  options: Array<SegOption<T>>
  onChange: (id: T) => void
  scroll?: boolean
}

function SegmentedRadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  scroll = false,
}: SegmentedRadioGroupProps<T>) {
  return (
    <section>
      <div className="font-mono text-xs tracking-wide text-muted">{label}</div>
      <div
        role="radiogroup"
        aria-label={label}
        className={cx('mt-2 flex w-full border-b border-edge', scroll ? 'overflow-x-auto' : '')}
        onKeyDown={(e) => {
          if (!options.length) return

          let nextIndex: number | null = null
          const currentIndex = Math.max(0, options.findIndex((o) => o.id === value))

          if (e.key === 'Home') nextIndex = 0
          else if (e.key === 'End') nextIndex = options.length - 1
          else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length

          if (nextIndex === null) return
          e.preventDefault()

          const next = options[nextIndex]
          if (!next) return

          onChange(next.id)
          requestAnimationFrame(() => {
            const radios = e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')
            radios[nextIndex]?.focus()
          })
        }}
      >
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            tabIndex={value === o.id ? 0 : -1}
            className={cx(
              '-mb-px border-b-2 px-3 py-2 text-left font-mono text-sm leading-tight transition-colors',
              scroll ? 'shrink-0 min-w-[5.75rem]' : 'flex-1',
              value === o.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  )
}

export function ReadingPrefsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { prefs, updatePrefs, reset } = useReadingPrefs()
  const distro = useDistro()

  const distroOptions: Array<SegOption<Distro>> = DISTRO_GROUPS.flatMap((g) => g.items.map((id) => ({ id, label: `@${id}` })))

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      label="Reading preferences"
      side="sheet-right"
      panelClassName="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold tracking-tight text-fg">Reading preferences</div>
          <div className="mt-1 text-sm text-muted">Applies to man page reading.</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} aria-label="Close reading preferences">
          Esc
        </Button>
      </div>

      <div className="mt-6 space-y-6">
        <SegmentedRadioGroup
          label="Default distro"
          value={distro.distro}
          options={distroOptions}
          onChange={(next) => distro.setDistro(next)}
          scroll
        />

        <SegmentedRadioGroup
          label="Font size"
          value={prefs.fontSize}
          options={[
            { id: 'small', label: 'S' },
            { id: 'medium', label: 'M' },
            { id: 'large', label: 'L' },
            { id: 'xlarge', label: 'XL' },
          ]}
          onChange={(fontSize) => updatePrefs({ fontSize })}
        />

        <SegmentedRadioGroup
          label="Font family"
          value={prefs.fontFamily}
          options={[
            { id: 'serif', label: 'Serif' },
            { id: 'sans', label: 'Sans' },
            { id: 'mono', label: 'Mono' },
          ]}
          onChange={(fontFamily) => updatePrefs({ fontFamily })}
        />

        <SegmentedRadioGroup
          label="Line height"
          value={prefs.lineHeight}
          options={[
            { id: 'compact', label: 'Compact' },
            { id: 'normal', label: 'Normal' },
            { id: 'relaxed', label: 'Relaxed' },
          ]}
          onChange={(lineHeight) => updatePrefs({ lineHeight })}
        />

        <SegmentedRadioGroup
          label="Column width"
          value={prefs.columnWidth}
          options={[
            { id: 'narrow', label: 'Narrow' },
            { id: 'normal', label: 'Normal' },
            { id: 'wide', label: 'Wide' },
          ]}
          onChange={(columnWidth) => updatePrefs({ columnWidth })}
        />

        <SegmentedRadioGroup
          label="Code theme"
          value={prefs.codeTheme}
          options={[
            { id: 'auto', label: 'Auto' },
            { id: 'light', label: 'Light' },
            { id: 'dark', label: 'Dark' },
          ]}
          onChange={(codeTheme) => updatePrefs({ codeTheme })}
        />

        <div className="pt-2">
          <Button variant="outline" className="font-mono" onClick={() => reset()}>
            Reset to defaults
          </Button>
        </div>
      </div>
    </Drawer>
  )
}
