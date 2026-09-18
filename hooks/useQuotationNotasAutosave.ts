import { Dispatch, FocusEvent, RefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { Cotizacion } from '@/lib/types'
import { NOTAS_AUTOSAVE_DELAY_MS, SECTION_IDLE_RELEASE_MS } from '@/lib/quotations/collaboration'
import { QuotationPresenceSection } from '@/hooks/useQuotationPresence'
import { saveQuotationNotes } from '@/lib/services/quotation-service'

interface UseQuotationNotasAutosaveOptions {
  id: string
  cotizacion: Cotizacion | null
  esEditable: boolean | undefined
  trackMutation: <T>(promise: Promise<T>) => Promise<T>
  setCotizacion: Dispatch<SetStateAction<Cotizacion | null>>
  setError: (message: string) => void
  setActiveSection: (section: QuotationPresenceSection) => void
  releaseSection: (section: QuotationPresenceSection) => void
  notasSectionRef: RefObject<HTMLDivElement | null>
}

/**
 * EF-3 3D-4: autosave/dirty/lock/focus de la sección "Notas", extraído
 * verbatim de `app/cotizaciones/[id]/page.tsx` -- sin cambios de
 * comportamiento. El más simple de los 3 clústeres de sección: un solo
 * campo de texto, sin conflicto multi-campo (a diferencia de
 * General/Totales) -- un 409 revierte o reintenta ese único campo, nunca
 * un grupo. Consume `useQuotationMutationTracker` (3D-1) vía `trackMutation`.
 */
export function useQuotationNotasAutosave({
  id,
  cotizacion,
  esEditable,
  trackMutation,
  setCotizacion,
  setError,
  setActiveSection,
  releaseSection,
  notasSectionRef,
}: UseQuotationNotasAutosaveOptions) {
  const [notasInternas, setNotasInternas] = useState('')
  // Bloque 2 (docs/PLAN.md) sub-tarea 6: `notas_pdf` es un campo nuevo,
  // distinto de `notas_internas` -- comparte pop-up y sección de
  // colaboración con él, así que comparte también dirty/debounce/lock en
  // vez de duplicar por completo el mecanismo para un segundo campo de
  // texto sin conflicto multi-usuario real (T7: Notas no tiene banner de
  // conflicto). Cada guardado manda los dos valores vigentes juntos.
  const [notasPdf, setNotasPdf] = useState('')
  const [isSavingNotas, setIsSavingNotas] = useState(false)

  const notasAutosaveTimerRef = useRef<number | null>(null)
  const notasIdleReleaseTimerRef = useRef<number | null>(null)
  const notasDirtyRef = useRef(false)
  // Fase 8.7 (Bloque 1): guard contra doble disparo -- ver el comentario
  // junto a flushGeneralDirtyFields (hooks/useQuotationGeneralAutosave.ts).
  // Notas no tiene un "flush de todos los campos dirty" separado (es un
  // solo campo), así que el guard vive directo en `persistNotasAutosave`:
  // si ya hay un guardado en vuelo, se devuelve esa misma promesa en vez de
  // disparar un segundo PATCH concurrente.
  const notasInFlightRef = useRef<Promise<unknown> | null>(null)
  const notasLockHeldRef = useRef(false)
  const notasFocusedRef = useRef(false)
  const notasValueRef = useRef('')
  const notasPdfValueRef = useRef('')
  const lastSavedNotasRef = useRef('')
  const lastSavedNotasPdfRef = useRef('')

  useEffect(() => { notasValueRef.current = notasInternas }, [notasInternas])
  useEffect(() => { notasPdfValueRef.current = notasPdf }, [notasPdf])

  const getCurrentNotasSnapshot = useCallback(() => notasValueRef.current.trim() ? notasValueRef.current : '', [])
  const getCurrentNotasPdfSnapshot = useCallback(() => notasPdfValueRef.current.trim() ? notasPdfValueRef.current : '', [])

  const clearNotasIdleReleaseTimer = useCallback(() => {
    if (notasIdleReleaseTimerRef.current !== null) { window.clearTimeout(notasIdleReleaseTimerRef.current); notasIdleReleaseTimerRef.current = null }
  }, [])

  const scheduleNotasIdleRelease = useCallback(() => {
    clearNotasIdleReleaseTimer()
    if (!notasLockHeldRef.current) return
    notasIdleReleaseTimerRef.current = window.setTimeout(() => {
      notasIdleReleaseTimerRef.current = null
      if (!notasLockHeldRef.current || notasDirtyRef.current || isSavingNotas) return
      notasLockHeldRef.current = false
      releaseSection('notas')
    }, SECTION_IDLE_RELEASE_MS)
  }, [clearNotasIdleReleaseTimer, isSavingNotas, releaseSection])

  // Fase 8.7 (Bloque 1): ya no es `async`/try-catch -- devuelve directamente
  // `p`, la promesa trackeada (rechaza en 409/500 igual que antes), con el
  // manejo de UI adjunto vía `.then(onFulfilled, onRejected)` en vez de
  // `await` + `catch`. Así el caller (flushPendingSaves) puede capturar `p` y
  // ver su rechazo real, y quien dispara esto sin esperarlo (el timer de
  // debounce, el blur) sigue sin generar un rechazo no manejado, porque el
  // handler queda adjunto en el mismo tick en que se crea la promesa.
  const persistNotasAutosave = useCallback((): Promise<unknown> => {
    if (notasInFlightRef.current) return notasInFlightRef.current
    if (!cotizacion) return Promise.resolve()
    const notasToSave = getCurrentNotasSnapshot()
    const notasPdfToSave = getCurrentNotasPdfSnapshot()
    const previousNotas = lastSavedNotasRef.current
    const previousNotasPdf = lastSavedNotasPdfRef.current
    if (notasToSave === previousNotas && notasPdfToSave === previousNotasPdf) {
      notasDirtyRef.current = false
      if (!notasFocusedRef.current) { clearNotasIdleReleaseTimer(); notasLockHeldRef.current = false; releaseSection('notas') }
      else scheduleNotasIdleRelease()
      return Promise.resolve()
    }
    setIsSavingNotas(true)
    const p = trackMutation(saveQuotationNotes(id, notasToSave || null, notasPdfToSave || null))
    notasInFlightRef.current = p
    p.then(
      () => {
        lastSavedNotasRef.current = notasToSave
        lastSavedNotasPdfRef.current = notasPdfToSave
        setCotizacion((prev) => (prev ? { ...prev, notas_internas: notasToSave || null, notas_pdf: notasPdfToSave || null } : prev))
        const hasPendingChanges = getCurrentNotasSnapshot() !== lastSavedNotasRef.current || getCurrentNotasPdfSnapshot() !== lastSavedNotasPdfRef.current
        notasDirtyRef.current = hasPendingChanges
        if (!notasFocusedRef.current) { clearNotasIdleReleaseTimer(); notasLockHeldRef.current = false; releaseSection('notas'); return }
        if (!hasPendingChanges) scheduleNotasIdleRelease()
      },
      (saveError: unknown) => {
        setError(saveError instanceof Error ? saveError.message : 'Error guardando notas internas')
        notasDirtyRef.current = getCurrentNotasSnapshot() !== lastSavedNotasRef.current || getCurrentNotasPdfSnapshot() !== lastSavedNotasPdfRef.current
        clearNotasIdleReleaseTimer()
        notasLockHeldRef.current = false
        releaseSection('notas')
      }
    ).finally(() => { setIsSavingNotas(false); notasInFlightRef.current = null })
    return p
  }, [clearNotasIdleReleaseTimer, cotizacion, getCurrentNotasPdfSnapshot, getCurrentNotasSnapshot, id, releaseSection, scheduleNotasIdleRelease, setCotizacion, setError, trackMutation])

  useEffect(() => {
    if (!esEditable || !notasLockHeldRef.current || !notasDirtyRef.current || isSavingNotas) return
    if (notasAutosaveTimerRef.current !== null) window.clearTimeout(notasAutosaveTimerRef.current)
    notasAutosaveTimerRef.current = window.setTimeout(() => { void persistNotasAutosave() }, NOTAS_AUTOSAVE_DELAY_MS)
    return () => { if (notasAutosaveTimerRef.current !== null) { window.clearTimeout(notasAutosaveTimerRef.current); notasAutosaveTimerRef.current = null } }
  }, [esEditable, isSavingNotas, notasInternas, notasPdf, persistNotasAutosave])

  const handleNotasFocus = useCallback(() => {
    if (!esEditable) return
    clearNotasIdleReleaseTimer()
    notasFocusedRef.current = true
    if (!notasLockHeldRef.current) { notasLockHeldRef.current = true; setActiveSection('notas') }
  }, [clearNotasIdleReleaseTimer, esEditable, setActiveSection])

  const handleNotasBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!esEditable) return
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && notasSectionRef.current?.contains(nextTarget)) return
    window.setTimeout(() => {
      const activeElement = document.activeElement
      if (activeElement && notasSectionRef.current?.contains(activeElement)) return
      notasFocusedRef.current = false
      clearNotasIdleReleaseTimer()
      if (notasDirtyRef.current) { void persistNotasAutosave(); return }
      notasLockHeldRef.current = false
      releaseSection('notas')
    }, 0)
  }, [clearNotasIdleReleaseTimer, esEditable, notasSectionRef, persistNotasAutosave, releaseSection])

  const trackedHandleNotasChange = useCallback((value: string) => {
    handleNotasFocus()
    notasDirtyRef.current = true
    setNotasInternas(value)
  }, [handleNotasFocus])

  const trackedHandleNotasPdfChange = useCallback((value: string) => {
    handleNotasFocus()
    notasDirtyRef.current = true
    setNotasPdf(value)
  }, [handleNotasFocus])

  // Refresco tras un save remoto: mismo criterio que General/Totales -- nunca
  // pisa una edición o un guardado propio en vuelo.
  const applyNotasOnly = useCallback((notas: string | null, notasPdfValue: string | null) => {
    const normalized = notas ?? ''
    const normalizedPdf = notasPdfValue ?? ''
    setNotasInternas(normalized)
    setNotasPdf(normalizedPdf)
    notasValueRef.current = normalized
    notasPdfValueRef.current = normalizedPdf
    lastSavedNotasRef.current = normalized
    lastSavedNotasPdfRef.current = normalizedPdf
    notasDirtyRef.current = false
    setCotizacion((prev) => (prev ? { ...prev, notas_internas: notas, notas_pdf: notasPdfValue } : prev))
  }, [setCotizacion])

  // Usado por `applyCotizacionToState` (page.tsx) al cargar/resincronizar la
  // cotización completa.
  const resetNotasFromServer = useCallback((cot: Cotizacion) => {
    const notas = cot.notas_internas ?? ''
    const notasPdfValue = cot.notas_pdf ?? ''
    setNotasInternas(notas)
    setNotasPdf(notasPdfValue)
    notasValueRef.current = notas
    notasPdfValueRef.current = notasPdfValue
    lastSavedNotasRef.current = notas
    lastSavedNotasPdfRef.current = notasPdfValue
    notasDirtyRef.current = false
  }, [])

  return {
    notasInternas,
    notasPdf,
    notasDirtyRef,
    notasLockHeldRef,
    persistNotasAutosave,
    applyNotasOnly,
    handleNotasFocus,
    handleNotasBlur,
    trackedHandleNotasChange,
    trackedHandleNotasPdfChange,
    clearNotasIdleReleaseTimer,
    resetNotasFromServer,
  }
}
