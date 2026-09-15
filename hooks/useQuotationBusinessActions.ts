import { Dispatch, SetStateAction, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Cotizacion } from '@/lib/types'
import { QuotationFormValues } from '@/lib/quotations/types'
import { FieldConflictDetail } from '@/lib/quotations/collaboration'
import { approveQuotation, buildComplementariaUrl, emitirCotizacion, generateQuotationPdf } from '@/lib/services/quotation-service'

interface UseQuotationBusinessActionsOptions {
  id: string
  cotizacion: Cotizacion | null
  router: ReturnType<typeof useRouter>
  watchedItems: QuotationFormValues['items']
  refreshCatalogos: () => Promise<void> | void
  applyCotizacionToState: (cot: Cotizacion) => void
  setError: Dispatch<SetStateAction<string | null>>
  setSuccess: Dispatch<SetStateAction<string | null>>
  setDriveLink: Dispatch<SetStateAction<string | null>>
  setAprobando: Dispatch<SetStateAction<boolean>>
  setGenerandoPdf: Dispatch<SetStateAction<boolean>>
  setGuardando: Dispatch<SetStateAction<boolean>>
  setCancelando: Dispatch<SetStateAction<boolean>>
  // 3D-5 (extracción del clúster de partidas) todavía no corrió -- este flush
  // sigue viniendo de `page.tsx` en vez de un hook `useQuotationItemCellsAutosave`.
  flushItemCellDirtyFields: () => Promise<unknown>[]
  flushGeneralDirtyFields: () => Promise<unknown>[]
  flushTotalsDirtyFields: () => Promise<unknown>[]
  notasDirtyRef: { current: boolean }
  persistNotasAutosave: () => Promise<unknown>
  pendingMutationsRef: { current: Set<Promise<unknown>> }
  itemCellConflicts: Record<string, Record<string, FieldConflictDetail>>
}

/**
 * EF-3 3D-7: `flushPendingSaves`/`transitionInFlightRef`/`aprobar`/
 * `generarPDF`/`generarCotizacion`/`crearComplementaria`/`cancelarCotizacion`
 * extraídos verbatim de `app/cotizaciones/[id]/page.tsx`. Decisión explícita
 * (no "extracción genérica"): se preserva la asimetría real tal cual --
 * `aprobar`/`generarPDF`/`generarCotizacion` sí flushean y usan el guard
 * síncrono `transitionInFlightRef`; `crearComplementaria` es navegación pura,
 * sin flush; `cancelarCotizacion` tiene su propio guard (`cancelando`) sin
 * flush ni `transitionInFlightRef`. Esta asimetría no se corrige aquí -- ver
 * el punto 2 de la especificación del bloque en
 * docs/EF-3_ENGINEERING_HARDENING.md.
 */
export function useQuotationBusinessActions({
  id,
  cotizacion,
  router,
  watchedItems,
  refreshCatalogos,
  applyCotizacionToState,
  setError,
  setSuccess,
  setDriveLink,
  setAprobando,
  setGenerandoPdf,
  setGuardando,
  setCancelando,
  flushItemCellDirtyFields,
  flushGeneralDirtyFields,
  flushTotalsDirtyFields,
  notasDirtyRef,
  persistNotasAutosave,
  pendingMutationsRef,
  itemCellConflicts,
}: UseQuotationBusinessActionsOptions) {
  const flushInFlightRef = useRef<Promise<boolean> | null>(null)

  // Fase 8.7 (Bloque 1): definida aquí porque necesita flushGeneralDirtyFields/
  // flushTotalsDirtyFields/flushItemCellDirtyFields/persistNotasAutosave.
  const flushPendingSaves = useCallback((): Promise<boolean> => {
    if (flushInFlightRef.current) return flushInFlightRef.current
    const run = (async (): Promise<boolean> => {
      const disparadas: Promise<unknown>[] = [
        ...flushGeneralDirtyFields(),
        ...flushTotalsDirtyFields(),
        ...flushItemCellDirtyFields(),
        ...(notasDirtyRef.current ? [persistNotasAutosave()] : []),
      ]
      // Combinar ANTES de que cualquiera de las recién disparadas alcance a
      // resolverse (nunca ocurre en el mismo tick síncrono: toda resolución
      // de promesa se agenda como microtask) -- si se esperara aquí a que
      // terminen antes de leer `pendingMutationsRef`, `trackMutation` ya
      // las habría sacado del Set con su propio `.finally()`.
      const enVuelo = [...Array.from(pendingMutationsRef.current), ...disparadas]
      // Un conflicto real de un PATCH atómico multi-campo (autofill de
      // producto, cambio de responsable) nunca se marca "dirty" -- eso
      // dispararía un reintento por celda individual y rompería la
      // atomicidad otra vez (ver handleSelectProduct). Por eso el bloqueo acá
      // se revisa directo contra `itemCellConflicts`: mientras quede alguno
      // sin resolver (Usar/Mantener lo limpia), la transición no procede,
      // haya o no algo más en vuelo/dirty en este instante.
      const sinConflictosSinResolver = Object.keys(itemCellConflicts).length === 0
      if (enVuelo.length === 0) return sinConflictosSinResolver
      const resultados = await Promise.allSettled(enVuelo)
      return sinConflictosSinResolver && resultados.every((r) => r.status === 'fulfilled')
    })()
    flushInFlightRef.current = run
    return run.finally(() => { flushInFlightRef.current = null })
  }, [flushGeneralDirtyFields, flushTotalsDirtyFields, flushItemCellDirtyFields, itemCellConflicts, notasDirtyRef, pendingMutationsRef, persistNotasAutosave])

  // Fase 8 (hardening pre-Proyectos): Aprobar/Generar YA NO mandan un PUT
  // completo de la cotización (`updateQuotation`/`save_cotizacion`) -- ese
  // camino no comparaba `revision` ni `base` contra nada, así que podía
  // revertir en silencio una partida que otro colaborador acababa de guardar
  // por PATCH un instante antes. Ambas transiciones son ahora: esperar las
  // mutaciones locales en vuelo -> ejecutar la transición de estado dedicada
  // (que opera contra Postgres, no contra lo que el cliente tenga en memoria)
  // -> releer canónico. `approve_cotizacion` ya existía con su propia
  // transacción; `emitir_cotizacion` es nueva, mismo patrón `FOR UPDATE`.
  // Fase 8.7 (Bloque 1): guard síncrono contra doble click/reentrancia. Los
  // `disabled={...}` del JSX dependen de `setState`, que es asíncrono y no
  // alcanza a deshabilitar el botón antes de un segundo click en el mismo
  // tick; este ref se revisa como primera línea, antes de cualquier setState.
  const transitionInFlightRef = useRef(false)
  const aprobar = useCallback(async () => {
    if (transitionInFlightRef.current) return
    transitionInFlightRef.current = true
    setAprobando(true); setError(null); setSuccess(null)
    try {
      const flushOk = await flushPendingSaves()
      if (!flushOk) { setError('Hay cambios recientes que no se guardaron correctamente. Revisa antes de aprobar.'); return }
      const fullCot = await approveQuotation(id)
      applyCotizacionToState(fullCot)
      await refreshCatalogos()
      setSuccess('¡Cotización aprobada! Proyecto y cuentas creados.')
      setTimeout(() => setSuccess(null), 4000)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error al aprobar') } finally { setAprobando(false); transitionInFlightRef.current = false }
  }, [applyCotizacionToState, flushPendingSaves, id, refreshCatalogos, setAprobando, setError, setSuccess])

  const handlePdfResult = useCallback((result: { savedToDrive: boolean; driveWebViewLink?: string; driveError?: string }) => {
    if (result.savedToDrive) { setSuccess('PDF guardado exitosamente en Drive'); setDriveLink(result.driveWebViewLink ?? null) }
    else if (result.driveError) { setError(`Error al guardar en Drive: ${result.driveError}`); setDriveLink(null) }
    else { setError('No se pudo guardar el PDF en Drive'); setDriveLink(null) }
    setTimeout(() => { setSuccess(null); setError(null); setDriveLink(null) }, 10000)
  }, [setDriveLink, setError, setSuccess])

  // Fase 8.7 (Bloque 1): "Generar PDF" (EMITIDA/APROBADA, no cambia estado) no
  // llamaba a flushPendingSaves -- el peor caso no es financiero (no crea
  // proyecto/cuentas) pero sí podía descargar un PDF con datos desactualizados
  // si quedaba algo dirty sin confirmar. Mismo guard que Generar/Aprobar.
  const generarPDF = useCallback(async () => {
    if (!cotizacion || transitionInFlightRef.current) return
    transitionInFlightRef.current = true
    setGenerandoPdf(true); setError(null); setSuccess(null); setDriveLink(null)
    try {
      const flushOk = await flushPendingSaves()
      if (!flushOk) { setError('Hay cambios recientes que no se guardaron correctamente. Revisa antes de generar el PDF.'); return }
      const result = await generateQuotationPdf(cotizacion, undefined, { skipDownload: true })
      handlePdfResult(result)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error al generar PDF') } finally { setGenerandoPdf(false); transitionInFlightRef.current = false }
  }, [cotizacion, flushPendingSaves, handlePdfResult, setDriveLink, setError, setGenerandoPdf, setSuccess])

  const generarCotizacion = useCallback(async () => {
    if (transitionInFlightRef.current) return
    transitionInFlightRef.current = true
    setGuardando(true); setError(null)
    try {
      const flushOk = await flushPendingSaves()
      if (!flushOk) { setError('Hay cambios recientes que no se guardaron correctamente. Revisa antes de generar.'); return }
      const refreshedCotizacion = await emitirCotizacion(id)
      applyCotizacionToState(refreshedCotizacion)
      setGenerandoPdf(true); setSuccess(null); setDriveLink(null)
      try {
        const result = await generateQuotationPdf(refreshedCotizacion, watchedItems, { skipDownload: true })
        handlePdfResult(result)
      } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error al generar PDF') } finally { setGenerandoPdf(false) }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al generar cotización')
    } finally { setGuardando(false); transitionInFlightRef.current = false }
  }, [applyCotizacionToState, flushPendingSaves, handlePdfResult, id, setDriveLink, setError, setGenerandoPdf, setGuardando, setSuccess, watchedItems])

  const crearComplementaria = useCallback(() => {
    if (cotizacion) router.push(buildComplementariaUrl(id, cotizacion))
  }, [cotizacion, id, router])

  const cancelarCotizacion = useCallback(async () => {
    if (!confirm('¿Cancelar esta cotización? Se eliminará el proyecto y las cuentas por cobrar/pagar asociadas.')) return
    setCancelando(true); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/cotizaciones/${id}/cancelar`, { method: 'POST' })
      if (!res.ok) { const body = await res.json(); throw new Error(body.error || 'Error al cancelar') }
      const updated = await res.json()
      applyCotizacionToState(updated)
      setSuccess('Cotización cancelada. Proyecto y cuentas eliminados.')
      setTimeout(() => setSuccess(null), 4000)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error al cancelar') } finally { setCancelando(false) }
  }, [applyCotizacionToState, id, setCancelando, setError, setSuccess])

  return {
    flushPendingSaves,
    aprobar,
    generarPDF,
    generarCotizacion,
    crearComplementaria,
    cancelarCotizacion,
  }
}
