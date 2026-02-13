'use client'

import { useEffect, useRef, useState } from 'react'

import { DISTRO_GROUPS, type Distro } from '../../lib/distro'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { useDistro } from '../state/distro'
import { useReadingPrefs } from '../state/readingPrefs'

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
      <div className="font-mono text-[11px] tracking-wide text-[color:var(--bm-muted)]">{label}</div>
      <div
        role="radiogroup"
        aria-label={label}
        className={`mt-2 flex w-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] ${
          scroll ? 'overflow-x-auto' : 'overflow-hidden'
        }`}
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
        {options.map((o, idx) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            tabIndex={value === o.id ? 0 : -1}
            className={`px-3 py-2 text-left font-mono text-[13px] leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bm-accent)/0.35] ${
              scroll ? 'shrink-0 min-w-[5.75rem]' : 'flex-1'
            } ${idx === 0 ? '' : 'border-l border-[var(--bm-border)]'} ${
              value === o.id
                ? 'bg-[var(--bm-accent-muted)] text-[color:var(--bm-fg)]'
                : 'bg-transparent text-[color:var(--bm-muted)] hover:bg-[var(--bm-surface-3)] hover:text-[color:var(--bm-fg)]'
            }`}
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

  const panelRef = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(open)

  useFocusTrap(open, panelRef)
  useBodyScrollLock(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }

    const t = window.setTimeout(() => setMounted(false), 150)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpenChange, open])

  if (!mounted) return null

  const distroOptions: Array<SegOption<Distro>> = DISTRO_GROUPS.flatMap((g) => g.items.map((id) => ({ id, label: `@${id}` })))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reading preferences"
      className={`fixed inset-0 z-40 flex items-end justify-center ${open ? 'pointer-events-auto' : 'pointer-events-none'} sm:items-stretch sm:justify-end`}
      onClick={() => onOpenChange(false)}
    >
      <div className={`absolute inset-0 bg-black/60 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} />
      <div
        ref={panelRef}
        className={`relative w-full max-h-[75vh] overflow-y-auto rounded-t-[var(--bm-radius-lg)] border border-[var(--bm-border)] bg-[var(--bm-surface-2)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] transition-transform sm:ml-auto sm:h-full sm:max-h-none sm:w-80 sm:rounded-none sm:border-l sm:border-t-0 sm:border-b-0 sm:border-r-0 sm:pb-6 ${
          open ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-y-0 sm:translate-x-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[14px] font-semibold tracking-tight text-[color:var(--bm-fg)]">Reading preferences</div>
            <div className="mt-1 text-[13px] text-[color:var(--bm-muted)]">Applies to man page reading.</div>
          </div>
          <button
            type="button"
            className="h-9 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 font-mono text-[13px] text-[color:var(--bm-fg)] hover:bg-[var(--bm-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bm-accent)/0.35]"
            onClick={() => onOpenChange(false)}
          >
            Esc
          </button>
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
            <button
              type="button"
              className="w-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-4 py-3 font-mono text-[13px] font-semibold text-[color:var(--bm-fg)] hover:bg-[var(--bm-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bm-accent)/0.35]"
              onClick={() => reset()}
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
