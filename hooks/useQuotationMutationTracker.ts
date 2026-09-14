import { useCallback, useRef } from 'react'

/**
 * EF-3 3D-1: extraído verbatim de `app/cotizaciones/[id]/page.tsx`
 * (Fase 8, hardening pre-Proyectos) -- sin cambios de lógica.
 *
 * Todo PATCH saliente (partidas, general, totales, notas) se registra aquí
 * mientras está en vuelo. `flushPendingSaves` lo usa antes de Emitir/Aprobar
 * -- sin esto, un PATCH disparado por un blur justo antes de pulsar el botón
 * podía seguir en vuelo cuando se leía el estado "canónico" del servidor, y
 * esa lectura llegaba más vieja que el propio cambio del usuario que está
 * aprobando. Deliberadamente simple: no es una cola ni un tracker global,
 * solo una foto de "lo que ya estaba en camino" en el instante exacto del
 * click -- lo que se dispare después no se espera aquí.
 */
export function useQuotationMutationTracker() {
  const pendingMutationsRef = useRef<Set<Promise<unknown>>>(new Set())
  const trackMutation = useCallback(<T,>(promise: Promise<T>): Promise<T> => {
    pendingMutationsRef.current.add(promise)
    // La cadena derivada de `.finally()` es una promesa nueva y distinta de
    // `promise`: si `promise` rechaza, esta también, y sin un handler propio
    // se reporta como rechazo no manejado aunque `promise` sí tenga el suyo
    // (el de quien la trackeó). Se apaga aquí explícitamente.
    promise.finally(() => { pendingMutationsRef.current.delete(promise) }).catch(() => {})
    return promise
  }, [])

  return { pendingMutationsRef, trackMutation }
}
