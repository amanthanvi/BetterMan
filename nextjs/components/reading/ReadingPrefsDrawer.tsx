'use client'

import { DISTRO_GROUPS, type Distro } from '../../lib/distro'
import { PREFERENCE_AXES, trackEvent } from '../../lib/analytics'
import { DEFAULT_PREFS, type ReadingPreferences } from '../../lib/readingPrefs'
import { useDistro } from '../state/distro'
import { useLang } from '../state/lang'
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
      <div className="text-sm text-ink-3">{label}</div>
      <div
        role="radiogroup"
        aria-label={label}
        className={cx('mt-1.5 flex w-full border-b border-rule', scroll ? 'overflow-x-auto' : '')}
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
              '-mb-px border-b-2 px-2.5 py-2 text-left text-sm leading-tight transition-colors',
              scroll ? 'shrink-0 min-w-[5.75rem]' : 'flex-1',
              value === o.id ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink',
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
  const { t } = useLang()

  const changePref = <K extends keyof Omit<ReadingPreferences, 'version'>>(axis: K, value: ReadingPreferences[K]) => {
    if (prefs[axis] === value) return
    updatePrefs({ [axis]: value })
    trackEvent('pref changed', axis)
  }

  const distroOptions: Array<SegOption<Distro>> = DISTRO_GROUPS.flatMap((g) => g.items.map((id) => ({ id, label: `@${id}` })))

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      label={t('Reading preferences')}
      side="sheet-right"
      panelClassName="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="small-caps text-lg font-semibold text-ink">{t('Reading preferences')}</h2>
          <p className="mt-1 text-sm text-ink-3">{t('How the manual is set on every page.')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} aria-label={t('Close reading preferences, Esc')}>
          Esc
        </Button>
      </div>

      <div className="mt-6 space-y-6">
        <SegmentedRadioGroup
          label={t('Default distro')}
          value={distro.preferred}
          options={distroOptions}
          onChange={(next) => distro.setDistro(next)}
          scroll
        />

        <SegmentedRadioGroup
          label={t('Font size')}
          value={prefs.fontSize}
          options={[
            { id: 'small', label: 'S' },
            { id: 'medium', label: 'M' },
            { id: 'large', label: 'L' },
            { id: 'xlarge', label: 'XL' },
          ]}
          onChange={(fontSize) => changePref('fontSize', fontSize)}
        />

        <SegmentedRadioGroup
          label={t('Font family')}
          value={prefs.fontFamily}
          options={[
            { id: 'serif', label: t('Serif') },
            { id: 'sans', label: t('Sans') },
            { id: 'mono', label: t('Mono') },
          ]}
          onChange={(fontFamily) => changePref('fontFamily', fontFamily)}
        />

        <SegmentedRadioGroup
          label={t('Line height')}
          value={prefs.lineHeight}
          options={[
            { id: 'compact', label: t('Compact') },
            { id: 'normal', label: t('Normal') },
            { id: 'relaxed', label: t('Relaxed') },
          ]}
          onChange={(lineHeight) => changePref('lineHeight', lineHeight)}
        />

        <SegmentedRadioGroup
          label={t('Column width')}
          value={prefs.columnWidth}
          options={[
            { id: 'narrow', label: t('Narrow') },
            { id: 'normal', label: t('Normal') },
            { id: 'wide', label: t('Wide') },
          ]}
          onChange={(columnWidth) => changePref('columnWidth', columnWidth)}
        />

        <SegmentedRadioGroup
          label={t('Code theme')}
          value={prefs.codeTheme}
          options={[
            { id: 'auto', label: t('Auto') },
            { id: 'light', label: t('Light') },
            { id: 'dark', label: t('Dark') },
          ]}
          onChange={(codeTheme) => changePref('codeTheme', codeTheme)}
        />

        <div className="pt-2">
          <Button variant="outline" onClick={() => {
            for (const axis of PREFERENCE_AXES) {
              if (prefs[axis] !== DEFAULT_PREFS[axis]) trackEvent('pref changed', axis)
            }
            reset()
          }}>
            {t('Reset to defaults')}
          </Button>
        </div>
      </div>
    </Drawer>
  )
}
