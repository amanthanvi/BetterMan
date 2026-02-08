'use client'

import { useEffect, useRef } from 'react'

import { useReadingPrefs } from '../state/readingPrefs'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'

export function ReadingPrefsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { prefs, updatePrefs, reset } = useReadingPrefs()
  const panelRef = useRef<HTMLDivElement | null>(null)

  useFocusTrap(open, panelRef)
  useBodyScrollLock(open)

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

  if (!open) return null

  const Seg = <T extends string>({
    label,
    value,
    options,
    onChange,
  }: {
    label: string
    value: T
    options: Array<{ id: T; label: string }>
    onChange: (id: T) => void
  }) => (
    <section>
      <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">{label}</div>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-3 flex flex-wrap gap-2"
        onKeyDown={(e) => {
          if (!options.length) return

          let nextIndex: number | null = null
          const currentIndex = Math.max(0, options.findIndex((o) => o.id === value))

          if (e.key === 'Home') nextIndex = 0
          else if (e.key === 'End') nextIndex = options.length - 1
          else if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
            nextIndex = (currentIndex + 1) % options.length
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
            nextIndex = (currentIndex - 1 + options.length) % options.length

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
            className={`rounded-full border border-[var(--bm-border)] px-4 py-2 text-sm font-medium ${
              value === o.id
                ? 'bg-[color:var(--bm-accent)/0.14] text-[color:var(--bm-fg)]'
                : 'bg-[color:var(--bm-surface)/0.75] text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-surface)/0.9] hover:text-[color:var(--bm-fg)]'
            }`}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reading preferences"
      className="fixed inset-0 z-40"
      onClick={() => onOpenChange(false)}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={panelRef}
        className="relative ml-auto h-full w-[min(92vw,28rem)] overflow-y-auto border-l border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.92] p-6 shadow-xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold tracking-tight">Reading preferences</div>
            <div className="mt-1 text-sm text-[color:var(--bm-muted)]">Applies to man page reading.</div>
          </div>
          <button
            type="button"
            className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9]"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-6">
          <Seg
            label="Font size"
            value={prefs.fontSize}
            options={[
              { id: 'small', label: 'Small' },
              { id: 'medium', label: 'Medium' },
              { id: 'large', label: 'Large' },
              { id: 'xlarge', label: 'XL' },
            ]}
            onChange={(fontSize) => updatePrefs({ fontSize })}
          />

          <Seg
            label="Font family"
            value={prefs.fontFamily}
            options={[
              { id: 'serif', label: 'Serif' },
              { id: 'sans', label: 'Sans' },
              { id: 'mono', label: 'Mono' },
            ]}
            onChange={(fontFamily) => updatePrefs({ fontFamily })}
          />

          <Seg
            label="Line height"
            value={prefs.lineHeight}
            options={[
              { id: 'compact', label: 'Compact' },
              { id: 'normal', label: 'Normal' },
              { id: 'relaxed', label: 'Relaxed' },
            ]}
            onChange={(lineHeight) => updatePrefs({ lineHeight })}
          />

          <Seg
            label="Column width"
            value={prefs.columnWidth}
            options={[
              { id: 'narrow', label: 'Narrow' },
              { id: 'normal', label: 'Normal' },
              { id: 'wide', label: 'Wide' },
            ]}
            onChange={(columnWidth) => updatePrefs({ columnWidth })}
          />

          <Seg
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
              className="w-full rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-3 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9]"
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
