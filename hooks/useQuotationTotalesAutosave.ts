import { Dispatch, FocusEvent, RefObject, SetStateAction, useCallback, useRef, useState } from 'react'
import { Cotizacion } from '@/lib/types'
import {
  buildTotalsSnapshot,
  FieldConflictDetail,
  PatchConflictError,
  QuotationTotalsField,
  SECTION_IDLE_RELEASE_MS,
  TOTALS_AUTOSAVE_DELAY_MS,
  TotalsSnapshot,
  normalizeTotalsFieldValue,
} from '@/lib/quotations/collaboration'
import { QuotationPresenceSection } from '@/hooks/useQuotationPresence'

interface UseQuotationTotalesAutosaveOptions {
  id: string
  cotizacion: Cotizacion | null
  esEditable: boolean | undefined
  trackMutation: <T>(promise: Promise<T>) => Promise<T>
  setCotizacion: Dispatch<SetStateAction<Cotizacion | null>>
  setError: (message: string) => void
  setActiveSection: (section: QuotationPresenceSection) => void
  releaseSection: (section: QuotationPresenceSection) => void
  totalsSectionRef: RefObject<HTMLDivElement | null>
}

/**
 * EF-3 3D-3: autosave/dirty/lock/focus/drenado de la sección "Totales"
 * (porcentaje_fee/iva_activo/descuento_tipo/descuento_valor), extraído
 * verbatim de `app/cotizaciones/[id]/page.tsx` -- sin cambios de
 * comportamiento. Consume `useQuotationMutationTracker` (3D-1) vía
 * `trackMutation`. A diferencia de General (3D-2), los 4 valores viven aquí
 * como estado propio del hook (no en `useQuotationForm` ni en RHF) -- por
 * eso el hook expone también `porcentaje_fee`/`iva_activo`/`descuento_tipo`/
 * `descuento_valor`, que `page.tsx` sigue necesitando para el cálculo de
 * totales (`calculateQuotationTotals`) y el JSX de `QuotationTotalsPanels`.
 */
export function useQuotationTotalesAutosave({
  id,
  cotizacion,
  esEditable,
  trackMutation,
  setCotizacion,
  setError,
  setActiveSection,
  releaseSection,
  totalsSectionRef,
}: UseQuotationTotalesAutosaveOptions) {
  const [porcentaje_fee, setPorcentajeFee] = useState(0.15)
  const [iva_activo, setIvaActivo] = useState(true)
  const [descuento_tipo, setDescuentoTipo] = useState<'monto' | 'porcentaje'>('monto')
  const [descuento_valor, setDescuentoValor] = useState(0)
  const [isSavingTotals, setIsSavingTotals] = useState(false)
  const [totalsFieldConflicts, setTotalsFieldConflicts] = useState<Partial<Record<QuotationTotalsField, FieldConflictDetail>>>({})

  const totalsDirtyRef = useRef(false)
  const totalsLockHeldRef = useRef(false)
  const totalsFocusedRef = useRef(false)
  const totalsIdleReleaseTimerRef = useRef<number | null>(null)
  const porcentajeFeeValueRef = useRef(0.15)
  const ivaActivoValueRef = useRef(true)
  const descuentoTipoValueRef = useRef<'monto' | 'porcentaje'>('monto')
  const descuentoValorValueRef = useRef(0)
  // Último valor de Totales confirmado por el servidor -- la fuente del
  // "base" que se manda en cada PATCH de campo para detectar conflictos.
  const totalsServerRef = useRef<TotalsSnapshot>(buildTotalsSnapshot({}))
  // Campos de Totales con una edición local sin confirmar. Reemplaza el
  // booleano de sección única: dos campos de la misma sección ahora se
  // guardan (y detectan conflicto) de forma independiente.
  const totalsFieldDirtyRef = useRef<Set<QuotationTotalsField>>(new Set())
  const totalsFieldSavingRef = useRef<Set<QuotationTotalsField>>(new Set())
  // "base" capturado por campo (al empezar a editarlo), listo para el
  // próximo PATCH.
  const totalsFieldBaseRef = useRef<Partial<Record<QuotationTotalsField, unknown>>>({})
  const totalsFieldTimersRef = useRef<Partial<Record<QuotationTotalsField, number | null>>>({})
  // Drenado real (mismo "causa F" que itemCellDrainRef/itemCellRetryNeededRef
  // de partidas): mientras un campo ya tiene una ronda de PATCH en vuelo, una
  // edición nueva sobre el MISMO campo no dispara un segundo `fetch` en
  // paralelo -- solo marca el `RetryNeeded` y el drenado, al terminar su
  // ronda actual, manda una ronda más con el valor final.
  const totalsFieldDrainRef = useRef<Map<QuotationTotalsField, Promise<unknown>>>(new Map())
  const totalsFieldRetryNeededRef = useRef<Set<QuotationTotalsField>>(new Set())
  // F26/3D-0b: instante en que cada campo queda confirmado por el servidor --
  // ver el comentario completo en `sendTotalsFieldPatchRound`/`applyTotalsOnly`.
  const totalsFieldConfirmedAtRef = useRef<Partial<Record<QuotationTotalsField, number>>>({})

  const clearTotalsFieldConflict = useCallback((field: QuotationTotalsField) => {
    setTotalsFieldConflicts((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const clearTotalsFieldTimer = useCallback((field: QuotationTotalsField) => {
    const timer = totalsFieldTimersRef.current[field]
    if (timer) window.clearTimeout(timer)
    totalsFieldTimersRef.current[field] = null
  }, [])

  const clearTotalsIdleReleaseTimer = useCallback(() => {
    if (totalsIdleReleaseTimerRef.current !== null) { window.clearTimeout(totalsIdleReleaseTimerRef.current); totalsIdleReleaseTimerRef.current = null }
  }, [])

  const scheduleTotalsIdleRelease = useCallback(() => {
    clearTotalsIdleReleaseTimer()
    if (!totalsLockHeldRef.current) return
    totalsIdleReleaseTimerRef.current = window.setTimeout(() => {
      totalsIdleReleaseTimerRef.current = null
      if (!totalsLockHeldRef.current || totalsDirtyRef.current || isSavingTotals) return
      totalsLockHeldRef.current = false
      releaseSection('totales')
    }, SECTION_IDLE_RELEASE_MS)
  }, [clearTotalsIdleReleaseTimer, isSavingTotals, releaseSection])

  const patchQuotationTotales = useCallback(async (
    patch: Record<string, unknown>,
    options?: { base?: Record<string, unknown> | null }
  ) => {
    const body: Record<string, unknown> = { ...patch }
    if (options?.base) body.base = options.base
    const response = await fetch(`/api/cotizaciones/${id}/totales`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (response.status === 409 && data?.error === 'conflict') {
      throw new PatchConflictError((data?.fields || {}) as Record<string, FieldConflictDetail>)
    }
    if (!response.ok) throw new Error(data?.error || 'Error actualizando configuración de totales')
    return data as Cotizacion | undefined
  }, [id])

  const getTotalsFieldValue = useCallback((field: QuotationTotalsField): unknown => {
    switch (field) {
      case 'porcentaje_fee': return porcentajeFeeValueRef.current
      case 'iva_activo': return ivaActivoValueRef.current
      case 'descuento_tipo': return descuentoTipoValueRef.current
      case 'descuento_valor': return descuentoValorValueRef.current
    }
  }, [])

  const sendTotalsFieldPatchRound = useCallback((field: QuotationTotalsField): Promise<unknown> => {
    if (!cotizacion) return Promise.resolve()
    totalsFieldSavingRef.current.add(field)
    setIsSavingTotals(true)
    const value = getTotalsFieldValue(field)
    const patch: Record<string, unknown> = { [field]: value }
    const baseValue = totalsFieldBaseRef.current[field]
    const base = baseValue !== undefined ? { [field]: baseValue } : undefined
    // Mismo motivo que `sendGeneralFieldPatchRound`: `trackMutation` debe
    // registrar la promesa SEMÁNTICA (tras resolver un conflicto idéntico),
    // no la cruda.
    const rawPatch = patchQuotationTotales(patch, { base })
    const semantic = rawPatch.then(
      (updated) => {
        try {
          // Mismo motivo que `sendGeneralFieldPatchRound`: no limpiar dirty
          // si ya hay un reintento encolado (`totalsFieldRetryNeededRef`) con
          // un valor más nuevo -- el drenado de `persistTotalsFieldAutosave`
          // manda la ronda siguiente y recién esa limpia el dirty de verdad.
          if (!totalsFieldRetryNeededRef.current.has(field)) {
            totalsFieldDirtyRef.current.delete(field)
          }
          clearTotalsFieldConflict(field)
          if (updated) {
            totalsServerRef.current = buildTotalsSnapshot({ porcentaje_fee: updated.porcentaje_fee, iva_activo: updated.iva_activo, descuento_tipo: updated.descuento_tipo, descuento_valor: updated.descuento_valor })
            // F26/3D-0b: ver el comentario equivalente en
            // `sendGeneralFieldPatchRound`.
            totalsFieldConfirmedAtRef.current[field] = Date.now()
            // Causa E (portada de partidas): refrescar el "base" al valor
            // recién confirmado, SIEMPRE -- ver el comentario equivalente en
            // `sendGeneralFieldPatchRound`.
            totalsFieldBaseRef.current[field] = totalsServerRef.current[field]
            setCotizacion((prev) => prev ? { ...prev, porcentaje_fee: updated.porcentaje_fee, iva_activo: updated.iva_activo, descuento_tipo: updated.descuento_tipo, descuento_valor: updated.descuento_valor } : prev)
          }
          totalsDirtyRef.current = totalsFieldDirtyRef.current.size > 0
          if (!totalsFocusedRef.current) {
            clearTotalsIdleReleaseTimer()
            if (totalsFieldDirtyRef.current.size === 0) { totalsLockHeldRef.current = false; releaseSection('totales'); return }
          }
          if (totalsFieldDirtyRef.current.size === 0) scheduleTotalsIdleRelease()
        } finally {
          totalsFieldSavingRef.current.delete(field)
          setIsSavingTotals(totalsFieldSavingRef.current.size > 0)
        }
      },
      (saveError: unknown) => {
        try {
          if (saveError instanceof PatchConflictError) {
            // Si lo que se intentó guardar es idéntico a lo que el servidor
            // ya tiene, no hay nada que decidir -- se resuelve solo, sin
            // mostrar el banner.
            const detail = saveError.fields[field]
            if (detail && normalizeTotalsFieldValue(field, detail.attempted) === normalizeTotalsFieldValue(field, detail.current)) {
              totalsServerRef.current = { ...totalsServerRef.current, [field]: detail.current } as TotalsSnapshot
              totalsFieldBaseRef.current[field] = detail.current
              // Mismo motivo que la rama de éxito: no limpiar dirty si ya
              // hay un reintento encolado con un valor más nuevo.
              if (!totalsFieldRetryNeededRef.current.has(field)) {
                totalsFieldDirtyRef.current.delete(field)
              }
              totalsDirtyRef.current = totalsFieldDirtyRef.current.size > 0
              return
            }
            setTotalsFieldConflicts((prev) => ({ ...prev, [field]: saveError.fields[field] }))
            throw saveError
          }
          setError(saveError instanceof Error ? saveError.message : 'Error guardando configuración de totales')
          throw saveError
        } finally {
          totalsFieldSavingRef.current.delete(field)
          setIsSavingTotals(totalsFieldSavingRef.current.size > 0)
        }
      }
    )
    return trackMutation(semantic)
  }, [clearTotalsFieldConflict, clearTotalsIdleReleaseTimer, cotizacion, getTotalsFieldValue, patchQuotationTotales, releaseSection, scheduleTotalsIdleRelease, setCotizacion, setError, trackMutation])

  /**
   * Drenado real para Totales (mismo patrón que `persistItemCellAutosave`
   * para partidas): como máximo una ronda de PATCH en vuelo por campo.
   */
  const persistTotalsFieldAutosave = useCallback((field: QuotationTotalsField): Promise<unknown> => {
    const existing = totalsFieldDrainRef.current.get(field)
    if (existing) {
      totalsFieldRetryNeededRef.current.add(field)
      return existing
    }
    const drain = (async () => {
      let result: unknown
      do {
        totalsFieldRetryNeededRef.current.delete(field)
        result = await sendTotalsFieldPatchRound(field)
      } while (totalsFieldRetryNeededRef.current.has(field))
      return result
    })().finally(() => {
      totalsFieldDrainRef.current.delete(field)
    })
    drain.catch(() => {})
    totalsFieldDrainRef.current.set(field, drain)
    return drain
  }, [sendTotalsFieldPatchRound])

  const persistTotalsFieldRef = useRef(persistTotalsFieldAutosave)
  persistTotalsFieldRef.current = persistTotalsFieldAutosave

  const markTotalsFieldDirty = useCallback((field: QuotationTotalsField) => {
    if (!totalsFieldDirtyRef.current.has(field)) {
      totalsFieldBaseRef.current[field] = totalsServerRef.current[field]
      totalsFieldDirtyRef.current.add(field)
    }
    totalsDirtyRef.current = true
    clearTotalsFieldTimer(field)
    totalsFieldTimersRef.current[field] = window.setTimeout(() => { void persistTotalsFieldRef.current(field) }, TOTALS_AUTOSAVE_DELAY_MS)
  }, [clearTotalsFieldTimer])

  /** Equivalente a `flushGeneralDirtyFields`, para Totales. */
  const flushTotalsDirtyFields = useCallback((): Promise<unknown>[] => {
    const disparadas: Promise<unknown>[] = []
    const fields = new Set([...Array.from(totalsFieldDirtyRef.current), ...Array.from(totalsFieldDrainRef.current.keys())])
    for (const field of Array.from(fields)) {
      const existingDrain = totalsFieldDrainRef.current.get(field)
      if (existingDrain) { disparadas.push(existingDrain); continue }
      if (!totalsFieldDirtyRef.current.has(field)) continue
      clearTotalsFieldTimer(field)
      disparadas.push(persistTotalsFieldAutosave(field))
    }
    return disparadas
  }, [clearTotalsFieldTimer, persistTotalsFieldAutosave])

  const resolveTotalsFieldConflict = useCallback((field: QuotationTotalsField, resolution: 'theirs' | 'mine') => {
    const detail = totalsFieldConflicts[field]
    if (!detail) return
    clearTotalsFieldConflict(field)
    totalsServerRef.current = { ...totalsServerRef.current, [field]: detail.current } as TotalsSnapshot
    totalsFieldBaseRef.current[field] = detail.current
    if (resolution === 'theirs') {
      if (field === 'porcentaje_fee') { const v = Number(detail.current) || 0; porcentajeFeeValueRef.current = v; setPorcentajeFee(v) }
      else if (field === 'iva_activo') { const v = Boolean(detail.current); ivaActivoValueRef.current = v; setIvaActivo(v) }
      else if (field === 'descuento_tipo') { const v = detail.current === 'porcentaje' ? 'porcentaje' : 'monto'; descuentoTipoValueRef.current = v; setDescuentoTipo(v) }
      else { const v = Number(detail.current) || 0; descuentoValorValueRef.current = v; setDescuentoValor(v) }
      totalsFieldDirtyRef.current.delete(field)
      totalsDirtyRef.current = totalsFieldDirtyRef.current.size > 0
      return
    }
    // Mismo motivo que `resolveGeneralFieldConflict`: reusa el drenado
    // genérico en vez de la ronda cruda.
    void persistTotalsFieldAutosave(field)
  }, [clearTotalsFieldConflict, persistTotalsFieldAutosave, totalsFieldConflicts])

  // Refresco tras un save remoto: NUNCA pisa un campo con una edición o un
  // guardado propio en vuelo (mismo criterio que `isCellBusy` en partidas).
  const applyTotalsOnly = useCallback((cot: Cotizacion, pedidoEn: number) => {
    const totalsConfig = buildTotalsSnapshot({ porcentaje_fee: cot.porcentaje_fee, iva_activo: cot.iva_activo, descuento_tipo: cot.descuento_tipo, descuento_valor: cot.descuento_valor })
    totalsServerRef.current = totalsConfig
    // F26/3D-0b: además de dirty/saving, un campo con una confirmación más
    // nueva (o del mismo instante) que el arranque de ESTA lectura también
    // cuenta como ocupado -- aplicarla lo pisaría con algo más viejo que lo
    // que el servidor ya confirmó después.
    const isFieldBusy = (field: QuotationTotalsField) =>
      totalsFieldDirtyRef.current.has(field) ||
      totalsFieldSavingRef.current.has(field) ||
      (totalsFieldConfirmedAtRef.current[field] !== undefined && totalsFieldConfirmedAtRef.current[field]! >= pedidoEn)
    if (!isFieldBusy('porcentaje_fee')) { setPorcentajeFee(totalsConfig.porcentaje_fee); porcentajeFeeValueRef.current = totalsConfig.porcentaje_fee }
    if (!isFieldBusy('iva_activo')) { setIvaActivo(totalsConfig.iva_activo); ivaActivoValueRef.current = totalsConfig.iva_activo }
    if (!isFieldBusy('descuento_tipo')) { setDescuentoTipo(totalsConfig.descuento_tipo); descuentoTipoValueRef.current = totalsConfig.descuento_tipo }
    if (!isFieldBusy('descuento_valor')) { setDescuentoValor(totalsConfig.descuento_valor); descuentoValorValueRef.current = totalsConfig.descuento_valor }
    totalsDirtyRef.current = totalsFieldDirtyRef.current.size > 0
    setCotizacion((prev) => prev ? {
      ...prev,
      porcentaje_fee: isFieldBusy('porcentaje_fee') ? prev.porcentaje_fee : totalsConfig.porcentaje_fee,
      iva_activo: isFieldBusy('iva_activo') ? prev.iva_activo : totalsConfig.iva_activo,
      descuento_tipo: isFieldBusy('descuento_tipo') ? prev.descuento_tipo : totalsConfig.descuento_tipo,
      descuento_valor: isFieldBusy('descuento_valor') ? prev.descuento_valor : totalsConfig.descuento_valor,
    } : prev)
  }, [setCotizacion])

  const handleTotalsFocus = useCallback(() => {
    if (!esEditable) return
    clearTotalsIdleReleaseTimer()
    totalsFocusedRef.current = true
    if (!totalsLockHeldRef.current) { totalsLockHeldRef.current = true; setActiveSection('totales') }
  }, [clearTotalsIdleReleaseTimer, esEditable, setActiveSection])

  const handleTotalsBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!esEditable) return
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && totalsSectionRef.current?.contains(nextTarget)) return
    window.setTimeout(() => {
      const activeElement = document.activeElement
      if (activeElement && totalsSectionRef.current?.contains(activeElement)) return
      totalsFocusedRef.current = false
      clearTotalsIdleReleaseTimer()
      if (totalsFieldDirtyRef.current.size > 0) { flushTotalsDirtyFields(); return }
      totalsLockHeldRef.current = false
      releaseSection('totales')
    }, 0)
  }, [clearTotalsIdleReleaseTimer, esEditable, flushTotalsDirtyFields, releaseSection, totalsSectionRef])

  const trackedSetPorcentajeFee = useCallback((value: number) => { handleTotalsFocus(); markTotalsFieldDirty('porcentaje_fee'); porcentajeFeeValueRef.current = value; setPorcentajeFee(value) }, [handleTotalsFocus, markTotalsFieldDirty])
  const trackedSetIvaActivo = useCallback((value: boolean | ((prev: boolean) => boolean)) => { handleTotalsFocus(); markTotalsFieldDirty('iva_activo'); const nextValue = typeof value === 'function' ? value(ivaActivoValueRef.current) : value; ivaActivoValueRef.current = nextValue; setIvaActivo(nextValue) }, [handleTotalsFocus, markTotalsFieldDirty])
  const trackedSetDescuentoTipo = useCallback((value: 'monto' | 'porcentaje') => { handleTotalsFocus(); markTotalsFieldDirty('descuento_tipo'); descuentoTipoValueRef.current = value; setDescuentoTipo(value) }, [handleTotalsFocus, markTotalsFieldDirty])
  const trackedSetDescuentoValor = useCallback((value: number) => { handleTotalsFocus(); markTotalsFieldDirty('descuento_valor'); descuentoValorValueRef.current = value; setDescuentoValor(value) }, [handleTotalsFocus, markTotalsFieldDirty])

  // Usado por `applyCotizacionToState` (page.tsx) al cargar/resincronizar la
  // cotización completa.
  const resetTotalsFromServer = useCallback((cot: Cotizacion) => {
    const totalsConfig = buildTotalsSnapshot({ porcentaje_fee: cot.porcentaje_fee, iva_activo: cot.iva_activo, descuento_tipo: cot.descuento_tipo, descuento_valor: cot.descuento_valor })
    totalsServerRef.current = totalsConfig
    totalsDirtyRef.current = false
    totalsFieldDirtyRef.current.clear()
    totalsFieldBaseRef.current = {}
    setTotalsFieldConflicts({})
    setPorcentajeFee(totalsConfig.porcentaje_fee)
    porcentajeFeeValueRef.current = totalsConfig.porcentaje_fee
    setIvaActivo(totalsConfig.iva_activo)
    ivaActivoValueRef.current = totalsConfig.iva_activo
    setDescuentoTipo(totalsConfig.descuento_tipo)
    descuentoTipoValueRef.current = totalsConfig.descuento_tipo
    setDescuentoValor(totalsConfig.descuento_valor)
    descuentoValorValueRef.current = totalsConfig.descuento_valor
  }, [])

  // Usado por el efecto de limpieza al desmontar (page.tsx).
  const clearAllTotalsFieldTimers = useCallback(() => {
    Object.values(totalsFieldTimersRef.current).forEach((timer) => timer && window.clearTimeout(timer))
  }, [])

  return {
    porcentaje_fee,
    iva_activo,
    descuento_tipo,
    descuento_valor,
    totalsFieldConflicts,
    totalsDirtyRef,
    totalsLockHeldRef,
    applyTotalsOnly,
    flushTotalsDirtyFields,
    resolveTotalsFieldConflict,
    handleTotalsFocus,
    handleTotalsBlur,
    trackedSetPorcentajeFee,
    trackedSetIvaActivo,
    trackedSetDescuentoTipo,
    trackedSetDescuentoValor,
    clearTotalsIdleReleaseTimer,
    resetTotalsFromServer,
    clearAllTotalsFieldTimers,
  }
}
