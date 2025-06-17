'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { SearchResult } from '@/lib/search/enhanced-search'

export function useWorkerSearch() {
  const [isReady, setIsReady] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const pendingSearchRef = useRef<((results: SearchResult[]) => void) | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.Worker) {
      return
    }
    
    // Initialize worker
    try {
      workerRef.current = new Worker(
        new URL('@/lib/performance/search-worker.ts', import.meta.url)
      )
    } catch (error) {
      console.error('Failed to initialize search worker:', error)
      return
    }

    workerRef.current.addEventListener('message', (event) => {
      const { type, results } = event.data

      switch (type) {
        case 'INIT_COMPLETE':
          setIsReady(true)
          break
        case 'SEARCH_RESULT':
          setIsSearching(false)
          if (pendingSearchRef.current) {
            pendingSearchRef.current(results)
            pendingSearchRef.current = null
          }
          break
      }
    })

    // Load search data
    fetch('/api/search/index')
      .then(res => res.json())
      .then(data => {
        workerRef.current?.postMessage({
          type: 'INIT',
          payload: { data },
        })
      })

    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  const search = useCallback(
    (query: string, options: any = {}): Promise<SearchResult[]> => {
      return new Promise((resolve) => {
        if (!workerRef.current || !isReady) {
          resolve([])
          return
        }

        setIsSearching(true)
        pendingSearchRef.current = resolve

        workerRef.current.postMessage({
          type: 'SEARCH',
          payload: { query, options },
        })
      })
    },
    [isReady]
  )

  return {
    search,
    isReady,
    isSearching,
  }
}