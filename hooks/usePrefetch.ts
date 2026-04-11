import { useCallback, useRef } from 'react'

type PrefetchFn = () => Promise<any>

interface PrefetchOptions {
  delay?: number
  debounce?: boolean
}

/**
 * Hook para prefetch de datos en background
 * Útil para precargardatos cuando el usuario hace hover o focus en un elemento
 */
export function usePrefetch(fetchFn: PrefetchFn, options: PrefetchOptions = {}) {
  const { delay = 0 } = options
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const lastFetchRef = useRef<Promise<any> | null>(null)

  const prefetch = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
      // Si ya hay un fetch pendiente, reutilizar
      if (lastFetchRef.current) {
        return
      }

      lastFetchRef.current = fetchFn().catch(() => {
        // Silenciar errores de prefetch
      }).finally(() => {
        lastFetchRef.current = null
      })
    }, delay)
  }, [fetchFn, delay])

  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  return { prefetch, cancel }
}
