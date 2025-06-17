import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  description?: string
  preventDefault?: boolean
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    for (const shortcut of shortcuts) {
      const isCtrlPressed = shortcut.ctrl ? event.ctrlKey : true
      const isMetaPressed = shortcut.meta ? event.metaKey : true
      const isShiftPressed = shortcut.shift ? event.shiftKey : !shortcut.shift
      const isAltPressed = shortcut.alt ? event.altKey : !shortcut.alt
      
      if (
        event.key.toLowerCase() === shortcut.key.toLowerCase() &&
        isCtrlPressed &&
        isMetaPressed &&
        isShiftPressed &&
        isAltPressed
      ) {
        if (shortcut.preventDefault !== false) {
          event.preventDefault()
        }
        shortcut.action()
        break
      }
    }
  }, [shortcuts])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

export function useGlobalKeyboardShortcuts() {
  const router = useRouter()
  
  const shortcuts: KeyboardShortcut[] = [
    // Navigation shortcuts
    {
      key: 'g',
      meta: true,
      action: () => router.push('/'),
      description: 'Go to home',
    },
    {
      key: 's',
      meta: true,
      action: () => router.push('/search'),
      description: 'Go to search',
    },
    {
      key: 'b',
      meta: true,
      action: () => router.push('/browse'),
      description: 'Browse commands',
    },
    {
      key: '/',
      action: () => {
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="search" i]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      },
      description: 'Focus search',
    },
    // Copy shortcuts
    {
      key: 'c',
      meta: true,
      shift: true,
      action: () => {
        const codeBlocks = document.querySelectorAll('pre code')
        if (codeBlocks.length > 0) {
          const firstBlock = codeBlocks[0]
          navigator.clipboard.writeText(firstBlock.textContent || '')
        }
      },
      description: 'Copy first code block',
    },
  ]
  
  useKeyboardShortcuts(shortcuts)
}