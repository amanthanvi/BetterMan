'use client'

import { useEffect } from 'react'

type _SavedBodyStyles = {
  overflow: string
  position: string
  top: string
  width: string
}

let _lockCount = 0
let _savedScrollY = 0
let _savedBodyStyles: _SavedBodyStyles | null = null

function _lockBody() {
  if (_lockCount === 0) {
    _savedScrollY = window.scrollY
    _savedBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    }

    // iOS Safari: overflow hidden alone doesn't prevent scroll-behind.
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${_savedScrollY}px`
    document.body.style.width = '100%'
  }

  _lockCount += 1
}

function _unlockBody() {
  _lockCount = Math.max(0, _lockCount - 1)
  if (_lockCount !== 0) return

  const prev = _savedBodyStyles
  _savedBodyStyles = null

  if (prev) {
    document.body.style.overflow = prev.overflow
    document.body.style.position = prev.position
    document.body.style.top = prev.top
    document.body.style.width = prev.width
  } else {
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
  }

  window.scrollTo(0, _savedScrollY)
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    _lockBody()
    return () => _unlockBody()
  }, [locked])
}
