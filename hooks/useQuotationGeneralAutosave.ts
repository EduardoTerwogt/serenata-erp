import { Dispatch, FocusEvent, RefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { UseFormGetValues, UseFormSetValue } from 'react-hook-form'
import { Cotizacion } from '@/lib/types'
import { QuotationFormValues } from '@/lib/quotations/types'
import {
  buildGeneralSnapshot,
  FieldConflictDetail,
  GENERAL_AUTOSAVE_DELAY_MS,
  GeneralSnapshot,
  normalizeGeneralFieldValue,
  PatchConflictError,
  QuotationGeneralField,
  SECTION_IDLE_RELEASE_MS,
} from '@/lib/quotations/collaboration'
import { QuotationPresenceSection } from '@/hooks/useQuotationPresence'

interface UseQuotationGeneralAutosaveOptions {
  id: string
  cotizacion: Cotizacion | null
  esEditable: boolean | undefined
  trackMutation: <T>(promise: Promise<T>) => Promise<T>
  setCotizacion: Dispatch<SetStateAction<Cotizacion | null>>
  setError: (message: string) => void
  setValue: UseFormSetValue<QuotationFormValues>
  getValues: UseFormGetValues<QuotationFormValues>
  setActiveSection: (section: QuotationPresenceSection) => void
  releaseSection: (section: QuotationPresenceSection) => void
  generalSectionRef: RefObject<HTMLDivElement | null>
  clienteInput: string
  proyectoInput: string
  setClienteInput: (value: string) => void
  setProyectoInput: (value: string) => void
  handleClienteChange: (value: string) => void
  handleProyectoChange: (value: string) => void
  seleccionarCliente: (value: string) => void
  seleccionarProyecto: (value: string) => void
}

/**
 * EF-3 3D-2: autosave/dirty/lock/focus/drenado de la sección "General"
 * (cliente/proyecto/fecha_entrega/locacion), extraído verbatim de
 * `app/cotizaciones/[id]/page.tsx` -- sin cambios de comportamiento. Consume
 * `useQuotationMutationTracker` (3D-1) vía `trackMutation`.
 */
export function useQuotationGeneralAutosave({
  id,
  cotizacion,
  esEditable,
  trackMutation,
  setCotizacion,
  setError,
  setValue,
  getValues,
  setActiveSection,
  releaseSection,
  generalSectionRef,
  clienteInput,
  proyectoInput,
  setClienteInput,
  setProyectoInput,
  handleClienteChange,
  handleProyectoChange,
  seleccionarCliente,
  seleccionarProyecto,
}: UseQuotationGeneralAutosaveOptions) {
  const [isSavingGeneral, setIsSavingGeneral] = useState(false)
  const [generalFieldConflicts, setGeneralFieldConflicts] = useState<Partial<Record<QuotationGeneralField, FieldConflictDetail>>>({})

  const generalDirtyRef = useRef(false)
  const generalLockHeldRef = useRef(false)
  const generalFocusedRef = useRef(false)
  const generalIdleReleaseTimerRef = useRef<number | null>(null)
  const clienteInputValueRef = useRef('')
  const proyectoInputValueRef = useRef('')
  // Último valor de General confirmado por el servidor -- la fuente del
  // "base" que se manda en cada PATCH de campo para detectar conflictos.
  // Nunca se pisa con lo que el usuario está tecleando (eso vive solo en el
  // form / en los *ValueRef de arriba).
  const generalServerRef = useRef<GeneralSnapshot>(buildGeneralSnapshot({}))
  // Campos de General con una edición local sin confirmar. Reemplaza el
  // booleano de sección única: dos campos de la misma sección ahora se
  // guardan (y detectan conflicto) de forma independiente, así "A edita
  // Fecha y B edita Locación" ya no puede pisarse -- cada PATCH manda solo
  // su propio campo.
  const generalFieldDirtyRef = useRef<Set<QuotationGeneralField>>(new Set())
  const generalFieldSavingRef = useRef<Set<QuotationGeneralField>>(new Set())
  // "base" capturado por campo (al empezar a editarlo), listo para el
  // próximo PATCH.
  const generalFieldBaseRef = useRef<Partial<Record<QuotationGeneralField, unknown>>>({})
  const generalFieldTimersRef = useRef<Partial<Record<QuotationGeneralField, number | null>>>({})
  // Drenado real (mismo "causa F" que itemCellDrainRef/itemCellRetryNeededRef
  // de partidas): mientras un campo ya tiene una ronda de PATCH en vuelo, una
  // edición nueva sobre el MISMO campo no dispara un segundo `fetch` en
  // paralelo -- solo marca el `RetryNeeded` y el drenado, al terminar su
  // ronda actual, manda una ronda más con el valor final.
  const generalFieldDrainRef = useRef<Map<QuotationGeneralField, Promise<unknown>>>(new Map())
  const generalFieldRetryNeededRef = useRef<Set<QuotationGeneralField>>(new Set())
  // F26/3D-0b: instante en que cada campo queda confirmado por el servidor --
  // ver el comentario completo en `sendGeneralFieldPatchRound`/`applyGeneralOnly`.
  const generalFieldConfirmedAtRef = useRef<Partial<Record<QuotationGeneralField, number>>>({})

  useEffect(() => { clienteInputValueRef.current = clienteInput }, [clienteInput])
  useEffect(() => { proyectoInputValueRef.current = proyectoInput }, [proyectoInput])

  const clearGeneralFieldConflict = useCallback((field: QuotationGeneralField) => {
    setGeneralFieldConflicts((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const clearGeneralFieldTimer = useCallback((field: QuotationGeneralField) => {
    const timer = generalFieldTimersRef.current[field]
    if (timer) window.clearTimeout(timer)
    generalFieldTimersRef.current[field] = null
  }, [])

  const clearGeneralIdleReleaseTimer = useCallback(() => {
    if (generalIdleReleaseTimerRef.current !== null) { window.clearTimeout(generalIdleReleaseTimerRef.current); generalIdleReleaseTimerRef.current = null }
  }, [])

  const scheduleGeneralIdleRelease = useCallback(() => {
    clearGeneralIdleReleaseTimer()
    if (!generalLockHeldRef.current) return
    generalIdleReleaseTimerRef.current = window.setTimeout(() => {
      generalIdleReleaseTimerRef.current = null
      if (!generalLockHeldRef.current || generalDirtyRef.current || isSavingGeneral) return
      generalLockHeldRef.current = false
      releaseSection('general')
    }, SECTION_IDLE_RELEASE_MS)
  }, [clearGeneralIdleReleaseTimer, isSavingGeneral, releaseSection])

  // Fetch crudo (no sendJson/getJson): esos helpers colapsan cualquier
  // respuesta no-2xx en un Error genérico y perderían el payload {fields}
  // del 409.
  const patchQuotationGeneral = useCallback(async (
    patch: Record<string, unknown>,
    options?: { base?: Record<string, unknown> | null }
  ) => {
    const body: Record<string, unknown> = { ...patch }
    if (options?.base) body.base = options.base
    const response = await fetch(`/api/cotizaciones/${id}/general`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (response.status === 409 && data?.error === 'conflict') {
      throw new PatchConflictError((data?.fields || {}) as Record<string, FieldConflictDetail>)
    }
    if (!response.ok) throw new Error(data?.error || 'Error actualizando información general')
    return data as Cotizacion | undefined
  }, [id])

  const getGeneralFieldValue = useCallback((field: QuotationGeneralField): unknown => {
    switch (field) {
      case 'cliente': return clienteInputValueRef.current
      case 'proyecto': return proyectoInputValueRef.current
      case 'fecha_entrega': return getValues('fecha_entrega') || ''
      case 'locacion': return getValues('locacion') || ''
    }
  }, [getValues])

  /**
   * PATCH de UN SOLO campo de General, con su propio "base" y su propio
   * conflicto. Reemplaza el guardado de sección completa: antes, editar
   * Fecha reenviaba también Cliente/Proyecto/Locación tal cual estuvieran en
   * pantalla en ese instante, así que la edición de Locación de otro
   * colaborador -- que ya había sido confirmada por el servidor mientras el
   * debounce de 800 ms de Fecha seguía corriendo -- podía quedar pisada por
   * ese PATCH. Con un campo por PATCH esto ya no es posible: cada uno solo
   * toca su propia columna.
   */
  // Fase 8.7 (Bloque 1): devuelve `p` (la promesa trackeada de
  // `patchQuotationGeneral`, que sí rechaza en 409/500) y mueve el manejo de
  // conflicto/error a `.then(onFulfilled, onRejected)`.
  const sendGeneralFieldPatchRound = useCallback((field: QuotationGeneralField): Promise<unknown> => {
    if (!cotizacion) return Promise.resolve()
    generalFieldSavingRef.current.add(field)
    setIsSavingGeneral(true)
    const value = getGeneralFieldValue(field)
    const patch: Record<string, unknown> = { [field]: value }
    const baseValue = generalFieldBaseRef.current[field]
    const base = baseValue !== undefined ? { [field]: baseValue } : undefined
    // La promesa CRUDA de `patchQuotationGeneral` rechaza en CUALQUIER 409,
    // incluido el conflicto "idéntico" que se resuelve solo abajo.
    // `trackMutation` debe registrar la promesa SEMÁNTICA (tras aplicar esa
    // resolución), no la cruda -- si no, `flushPendingSaves` vería un
    // conflicto ya auto-resuelto como una mutación fallida.
    const rawPatch = patchQuotationGeneral(patch, { base })
    const semantic = rawPatch.then(
      (updated) => {
        try {
          // Si ya hay un reintento encolado (`generalFieldRetryNeededRef`),
          // esta ronda que acaba de resolver ya está desactualizada frente a
          // una edición más nueva -- limpiar el dirty acá dejaría creer que
          // el campo ya no tiene cambios locales sin confirmar. El drenado
          // de `persistGeneralFieldAutosave` manda la ronda siguiente con el
          // valor correcto -- recién esa, al no encontrar más reintentos
          // pendientes, limpia el dirty de verdad.
          if (!generalFieldRetryNeededRef.current.has(field)) {
            generalFieldDirtyRef.current.delete(field)
          }
          clearGeneralFieldConflict(field)
          if (updated) {
            generalServerRef.current = buildGeneralSnapshot({ cliente: updated.cliente, proyecto: updated.proyecto, fecha_entrega: updated.fecha_entrega || '', locacion: updated.locacion || '' })
            // F26/3D-0b: instante en que el campo pasa a estar confirmado
            // por el servidor -- una reconciliación que arrancó antes de
            // esto no debe pisarlo con una lectura más vieja.
            generalFieldConfirmedAtRef.current[field] = Date.now()
            // Causa E (portada de partidas): refrescar el "base" al valor
            // recién confirmado, SIEMPRE -- no solo cuando el dirty se
            // limpia. Sin esto, una ronda encolada por
            // `generalFieldRetryNeededRef` mandaría su PATCH con el `base`
            // de ANTES de esta ronda exitosa, que ya quedó viejo frente al
            // valor real en el servidor, y produciría un 409 contra uno
            // mismo -- el mismo conflicto falso que este fix busca eliminar.
            generalFieldBaseRef.current[field] = generalServerRef.current[field]
            setCotizacion((prev) => prev ? { ...prev, cliente: updated.cliente, proyecto: updated.proyecto, fecha_entrega: updated.fecha_entrega, locacion: updated.locacion } : prev)
          }
          generalDirtyRef.current = generalFieldDirtyRef.current.size > 0
          if (!generalFocusedRef.current) {
            clearGeneralIdleReleaseTimer()
            if (generalFieldDirtyRef.current.size === 0) { generalLockHeldRef.current = false; releaseSection('general'); return }
          }
          if (generalFieldDirtyRef.current.size === 0) scheduleGeneralIdleRelease()
        } finally {
          generalFieldSavingRef.current.delete(field)
          setIsSavingGeneral(generalFieldSavingRef.current.size > 0)
        }
      },
      (saveError: unknown) => {
        try {
          if (saveError instanceof PatchConflictError) {
            // Si lo que se intentó guardar es idéntico a lo que el servidor
            // ya tiene, no hay nada que decidir -- se resuelve solo, sin
            // mostrar el banner.
            const detail = saveError.fields[field]
            if (detail && normalizeGeneralFieldValue(detail.attempted) === normalizeGeneralFieldValue(detail.current)) {
              generalServerRef.current = { ...generalServerRef.current, [field]: detail.current } as GeneralSnapshot
              generalFieldBaseRef.current[field] = detail.current
              // Mismo motivo que la rama de éxito: no limpiar dirty si ya
              // hay un reintento encolado con un valor más nuevo.
              if (!generalFieldRetryNeededRef.current.has(field)) {
                generalFieldDirtyRef.current.delete(field)
              }
              generalDirtyRef.current = generalFieldDirtyRef.current.size > 0
              return
            }
            // Nunca se descarta en silencio lo que el usuario tecleó: el
            // campo queda tal cual, se muestra el conflicto y el usuario
            // decide con qué valor seguir. Se relanza para que la promesa
            // trackeada rechace de verdad y `flushPendingSaves` vea la
            // falla real (conflicto sin resolver).
            setGeneralFieldConflicts((prev) => ({ ...prev, [field]: saveError.fields[field] }))
            throw saveError
          }
          setError(saveError instanceof Error ? saveError.message : 'Error guardando información general')
          throw saveError
        } finally {
          generalFieldSavingRef.current.delete(field)
          setIsSavingGeneral(generalFieldSavingRef.current.size > 0)
        }
      }
    )
    return trackMutation(semantic)
  }, [clearGeneralFieldConflict, clearGeneralIdleReleaseTimer, cotizacion, getGeneralFieldValue, patchQuotationGeneral, releaseSection, scheduleGeneralIdleRelease, setCotizacion, setError, trackMutation])

  /**
   * Drenado real para General (mismo patrón que `persistItemCellAutosave`
   * para partidas): como máximo una ronda de PATCH en vuelo por campo. Si
   * llega una edición nueva mientras una ronda ya está en curso, no dispara
   * un segundo `fetch` en paralelo -- marca `generalFieldRetryNeededRef` y
   * el `do...while` manda una ronda más en cuanto la actual resuelve, con el
   * valor final del form en ese momento.
   */
  const persistGeneralFieldAutosave = useCallback((field: QuotationGeneralField): Promise<unknown> => {
    const existing = generalFieldDrainRef.current.get(field)
    if (existing) {
      generalFieldRetryNeededRef.current.add(field)
      return existing
    }
    const drain = (async () => {
      let result: unknown
      do {
        generalFieldRetryNeededRef.current.delete(field)
        result = await sendGeneralFieldPatchRound(field)
      } while (generalFieldRetryNeededRef.current.has(field))
      return result
    })().finally(() => {
      generalFieldDrainRef.current.delete(field)
    })
    // Este drenado se dispara "fire and forget" desde un debounce -- sin
    // este `catch` mudo, un conflicto real (que a propósito rechaza el
    // drenado) se reportaría como unhandled rejection aunque el banner de
    // conflicto ya se haya mostrado.
    drain.catch(() => {})
    generalFieldDrainRef.current.set(field, drain)
    return drain
  }, [sendGeneralFieldPatchRound])

  const persistGeneralFieldRef = useRef(persistGeneralFieldAutosave)
  persistGeneralFieldRef.current = persistGeneralFieldAutosave

  /**
   * Marca un campo de General como sucio y programa su propio autoguardado
   * debounced -- mismo patrón que `handleItemFieldChange` para celdas de
   * partidas, pero sin necesitar wiring por-input en el componente hijo: el
   * "base" se captura la PRIMERA vez que el campo se ensucia desde el
   * último valor confirmado por el servidor (`generalServerRef`), no en un
   * focus separado, porque `QuotationGeneralInfoSection` solo expone
   * focus/blur a nivel de sección.
   */
  const markGeneralFieldDirty = useCallback((field: QuotationGeneralField) => {
    if (!generalFieldDirtyRef.current.has(field)) {
      generalFieldBaseRef.current[field] = generalServerRef.current[field]
      generalFieldDirtyRef.current.add(field)
    }
    generalDirtyRef.current = true
    clearGeneralFieldTimer(field)
    generalFieldTimersRef.current[field] = window.setTimeout(() => { void persistGeneralFieldRef.current(field) }, GENERAL_AUTOSAVE_DELAY_MS)
  }, [clearGeneralFieldTimer])

  // Al salir de la sección se guardan de inmediato todos los campos sucios
  // en vez de esperar su debounce individual -- mismo criterio que tenía el
  // guardado de sección completa al perder el foco.
  // Fase 8.7 (Bloque 1): un campo "sucio" sigue contando como tal hasta que
  // su PATCH resuelve con éxito (`sendGeneralFieldPatchRound` recién lo
  // borra de `generalFieldDirtyRef` en el `.then` de éxito).
  // Fase 8.7.2 (causa F, portado a General): itera la UNIÓN de
  // `generalFieldDirtyRef` y `generalFieldDrainRef.keys()`, no solo dirty --
  // así un drenado ya en curso se ve aunque su ronda actual haya limpiado
  // `generalFieldDirtyRef` un instante antes de que esto corra.
  const flushGeneralDirtyFields = useCallback((): Promise<unknown>[] => {
    const disparadas: Promise<unknown>[] = []
    const fields = new Set([...Array.from(generalFieldDirtyRef.current), ...Array.from(generalFieldDrainRef.current.keys())])
    for (const field of Array.from(fields)) {
      const existingDrain = generalFieldDrainRef.current.get(field)
      if (existingDrain) { disparadas.push(existingDrain); continue }
      if (!generalFieldDirtyRef.current.has(field)) continue
      clearGeneralFieldTimer(field)
      disparadas.push(persistGeneralFieldAutosave(field))
    }
    return disparadas
  }, [clearGeneralFieldTimer, persistGeneralFieldAutosave])

  const resolveGeneralFieldConflict = useCallback((field: QuotationGeneralField, resolution: 'theirs' | 'mine') => {
    const detail = generalFieldConflicts[field]
    if (!detail) return
    clearGeneralFieldConflict(field)
    // El "current" que devolvió la RPC es la verdad del servidor a partir de
    // ahora, gane el valor ajeno o el propio -- ambos casos parten de ahí
    // para el próximo PATCH.
    generalServerRef.current = { ...generalServerRef.current, [field]: detail.current } as GeneralSnapshot
    generalFieldBaseRef.current[field] = detail.current
    if (resolution === 'theirs') {
      const value = String(detail.current ?? '')
      if (field === 'cliente') { setClienteInput(value); clienteInputValueRef.current = value }
      else if (field === 'proyecto') { setProyectoInput(value); proyectoInputValueRef.current = value }
      else setValue(field, value)
      generalFieldDirtyRef.current.delete(field)
      generalDirtyRef.current = generalFieldDirtyRef.current.size > 0
      return
    }
    // "mine": lo tecleado se conserva tal cual, se reintenta con el base ya
    // corregido -- reusa el drenado genérico en vez de llamar la ronda cruda
    // directo, para que un reintento concurrente sobre este mismo campo se
    // encole en vez de correr en paralelo.
    void persistGeneralFieldAutosave(field)
  }, [clearGeneralFieldConflict, generalFieldConflicts, persistGeneralFieldAutosave, setClienteInput, setProyectoInput, setValue])

  // Refresco tras un save remoto: NUNCA pisa un campo con una edición o un
  // guardado propio en vuelo (mismo criterio que `isCellBusy` en partidas).
  // Antes esto se saltaba la sección COMPLETA si cualquier campo estaba
  // sucio -- con eso, editar Fecha dejaba a Locación viendo una foto vieja
  // aunque nadie la estuviera tocando.
  const applyGeneralOnly = useCallback((cot: Cotizacion, pedidoEn: number) => {
    const general = buildGeneralSnapshot({ cliente: cot.cliente, proyecto: cot.proyecto, fecha_entrega: cot.fecha_entrega || '', locacion: cot.locacion || '' })
    generalServerRef.current = general
    // F26/3D-0b: además de dirty/saving, un campo con una confirmación más
    // nueva (o del mismo instante) que el arranque de ESTA lectura también
    // cuenta como ocupado -- aplicarla lo pisaría con algo más viejo que lo
    // que el servidor ya confirmó después.
    const isFieldBusy = (field: QuotationGeneralField) =>
      generalFieldDirtyRef.current.has(field) ||
      generalFieldSavingRef.current.has(field) ||
      (generalFieldConfirmedAtRef.current[field] !== undefined && generalFieldConfirmedAtRef.current[field]! >= pedidoEn)
    if (!isFieldBusy('cliente')) { setClienteInput(general.cliente); clienteInputValueRef.current = general.cliente; setValue('cliente', general.cliente) }
    if (!isFieldBusy('proyecto')) { setProyectoInput(general.proyecto); proyectoInputValueRef.current = general.proyecto; setValue('proyecto', general.proyecto) }
    if (!isFieldBusy('fecha_entrega')) setValue('fecha_entrega', general.fecha_entrega)
    if (!isFieldBusy('locacion')) setValue('locacion', general.locacion)
    generalDirtyRef.current = generalFieldDirtyRef.current.size > 0
    setCotizacion((prev) => prev ? {
      ...prev,
      cliente: isFieldBusy('cliente') ? prev.cliente : general.cliente,
      proyecto: isFieldBusy('proyecto') ? prev.proyecto : general.proyecto,
      fecha_entrega: isFieldBusy('fecha_entrega') ? prev.fecha_entrega : (general.fecha_entrega || null),
      locacion: isFieldBusy('locacion') ? prev.locacion : (general.locacion || null),
    } : prev)
  }, [setClienteInput, setCotizacion, setProyectoInput, setValue])

  const handleGeneralFocus = useCallback(() => {
    if (!esEditable) return
    clearGeneralIdleReleaseTimer()
    generalFocusedRef.current = true
    if (!generalLockHeldRef.current) { generalLockHeldRef.current = true; setActiveSection('general') }
  }, [clearGeneralIdleReleaseTimer, esEditable, setActiveSection])

  const handleGeneralBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!esEditable) return
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && generalSectionRef.current?.contains(nextTarget)) return
    window.setTimeout(() => {
      const activeElement = document.activeElement
      if (activeElement && generalSectionRef.current?.contains(activeElement)) return
      generalFocusedRef.current = false
      clearGeneralIdleReleaseTimer()
      if (generalFieldDirtyRef.current.size > 0) { flushGeneralDirtyFields(); return }
      generalLockHeldRef.current = false
      releaseSection('general')
    }, 0)
  }, [clearGeneralIdleReleaseTimer, esEditable, flushGeneralDirtyFields, generalSectionRef, releaseSection])

  const trackedHandleClienteChange = useCallback((value: string) => { handleGeneralFocus(); markGeneralFieldDirty('cliente'); handleClienteChange(value) }, [handleClienteChange, handleGeneralFocus, markGeneralFieldDirty])
  const trackedHandleProyectoChange = useCallback((value: string) => { handleGeneralFocus(); markGeneralFieldDirty('proyecto'); handleProyectoChange(value) }, [handleGeneralFocus, handleProyectoChange, markGeneralFieldDirty])
  const trackedSelectCliente = useCallback((value: string) => { handleGeneralFocus(); markGeneralFieldDirty('cliente'); seleccionarCliente(value) }, [handleGeneralFocus, markGeneralFieldDirty, seleccionarCliente])
  const trackedSelectProyecto = useCallback((value: string) => { handleGeneralFocus(); markGeneralFieldDirty('proyecto'); seleccionarProyecto(value) }, [handleGeneralFocus, markGeneralFieldDirty, seleccionarProyecto])
  const trackedHandleFechaEntregaChange = useCallback(() => { handleGeneralFocus(); markGeneralFieldDirty('fecha_entrega') }, [handleGeneralFocus, markGeneralFieldDirty])
  const trackedHandleLocacionChange = useCallback(() => { handleGeneralFocus(); markGeneralFieldDirty('locacion') }, [handleGeneralFocus, markGeneralFieldDirty])

  // Usado por `applyCotizacionToState` (page.tsx) al cargar/resincronizar la
  // cotización completa -- consolida en un solo lugar lo que antes eran
  // varias líneas sueltas tocando refs internos de este hook desde afuera.
  const resetGeneralFromServer = useCallback((cot: Cotizacion) => {
    const general = buildGeneralSnapshot({ cliente: cot.cliente, proyecto: cot.proyecto, fecha_entrega: cot.fecha_entrega || '', locacion: cot.locacion || '' })
    generalServerRef.current = general
    generalDirtyRef.current = false
    generalFieldDirtyRef.current.clear()
    generalFieldBaseRef.current = {}
    setGeneralFieldConflicts({})
    setClienteInput(cot.cliente || '')
    clienteInputValueRef.current = cot.cliente || ''
    setProyectoInput(cot.proyecto || '')
    proyectoInputValueRef.current = cot.proyecto || ''
  }, [setClienteInput, setProyectoInput])

  // Usado por el efecto de limpieza al desmontar (page.tsx) -- apaga
  // cualquier timer de debounce de campo pendiente.
  const clearAllGeneralFieldTimers = useCallback(() => {
    Object.values(generalFieldTimersRef.current).forEach((timer) => timer && window.clearTimeout(timer))
  }, [])

  return {
    generalDirtyRef,
    generalLockHeldRef,
    generalFieldConflicts,
    applyGeneralOnly,
    flushGeneralDirtyFields,
    resolveGeneralFieldConflict,
    handleGeneralFocus,
    handleGeneralBlur,
    trackedHandleClienteChange,
    trackedHandleProyectoChange,
    trackedSelectCliente,
    trackedSelectProyecto,
    trackedHandleFechaEntregaChange,
    trackedHandleLocacionChange,
    clearGeneralIdleReleaseTimer,
    resetGeneralFromServer,
    clearAllGeneralFieldTimers,
  }
}
