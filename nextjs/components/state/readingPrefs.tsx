'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import type { ReadingPreferences } from '../../lib/readingPrefs'
import {
  DEFAULT_PREFS,
  READING_PREFS_EVENT,
  READING_PREFS_STORAGE_KEY,
  getReadingPrefs,
  resetReadingPrefs,
  setReadingPrefs,
} from '../../lib/readingPrefs'

type ReadingPrefsContextValue = {
  prefs: ReadingPreferences
  setPrefs: (prefs: ReadingPreferences) => void
  updatePrefs: (partial: Partial<Omit<ReadingPreferences, 'version'>>) => void
  reset: () => void
}

const ReadingPrefsContext = createContext<ReadingPrefsContextValue | null>(null)

function applyToBody(prefs: ReadingPreferences) {
  try {
    document.body.dataset.bmFontSize = prefs.fontSize
    document.body.dataset.bmFontFamily = prefs.fontFamily
    document.body.dataset.bmLineHeight = prefs.lineHeight
    document.body.dataset.bmColumnWidth = prefs.columnWidth
    document.body.dataset.bmCodeTheme = prefs.codeTheme
  } catch {
    // ignore
  }
}

export function ReadingPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<ReadingPreferences>(() => getReadingPrefs())

  const setPrefs = useCallback((next: ReadingPreferences) => {
    setPrefsState(next)
    setReadingPrefs(next)
  }, [])

  const updatePrefs = useCallback((partial: Partial<Omit<ReadingPreferences, 'version'>>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...partial, version: 1 } as ReadingPreferences
      setReadingPrefs(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setPrefsState(DEFAULT_PREFS)
    resetReadingPrefs()
  }, [])

  useEffect(() => {
    applyToBody(prefs)
  }, [prefs])

  useEffect(() => {
    const sync = () => setPrefsState(getReadingPrefs())

    const onPrefs = () => sync()
    const onStorage = (e: StorageEvent) => {
      if (e.key !== READING_PREFS_STORAGE_KEY) return
      sync()
    }

    window.addEventListener(READING_PREFS_EVENT, onPrefs)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(READING_PREFS_EVENT, onPrefs)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const value = useMemo(() => ({ prefs, setPrefs, updatePrefs, reset }), [prefs, reset, setPrefs, updatePrefs])
  return <ReadingPrefsContext.Provider value={value}>{children}</ReadingPrefsContext.Provider>
}

export function useReadingPrefs(): ReadingPrefsContextValue {
  const ctx = useContext(ReadingPrefsContext)
  if (!ctx) throw new Error('useReadingPrefs must be used within <ReadingPrefsProvider>')
  return ctx
}
