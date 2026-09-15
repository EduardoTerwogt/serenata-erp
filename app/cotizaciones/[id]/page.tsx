'use client'

import { FocusEvent, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { StatusBadge, toneForCotizacionEstado } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Cotizacion, ItemCotizacion, Proveedor } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { useQuotationMutationTracker } from '@/hooks/useQuotationMutationTracker'
import { useQuotationGeneralAutosave } from '@/hooks/useQuotationGeneralAutosave'
import { useQuotationTotalesAutosave } from '@/hooks/useQuotationTotalesAutosave'
import { useQuotationNotasAutosave } from '@/hooks/useQuotationNotasAutosave'
import { useQuotationReconciliation } from '@/hooks/useQuotationReconciliation'
import { QuotationItemCellField, QuotationPresenceSection, useQuotationPresence } from '@/hooks/useQuotationPresence'
import { ImportableItem, QuotationItemsController } from '@/hooks/useQuotationItems'
import { calculateEstimatedTaxes, calculateQuotationTotals, normalizeQuotationItem } from '@/lib/quotations/calculations'
import { buildReadOnlyTotals, EMPTY_QUOTATION_ITEM, isBlankQuotationItem } from '@/lib/quotations/mappers'
import { BulkImportPayload, runIdempotentBulkImportSubmit } from '@/lib/client/bulkImportIdempotency'
import { QuotationFormValues } from '@/lib/quotations/types'
import { approveQuotation, buildComplementariaUrl, emitirCotizacion, fetchQuotationDetail, fetchProveedores, generateQuotationPdf } from '@/lib/services/quotation-service'
import { formatDateDisplay } from '@/lib/format-date'
import { Icon } from '@/components/ui/Icon'
import { QuotationGeneralInfoSection } from '@/components/quotations/QuotationGeneralInfoSection'
import { QuotationItemsSection } from '@/components/quotations/QuotationItemsSection'
import { QuotationTotalsPanels } from '@/components/quotations/QuotationTotalsPanels'
import { QuotationCopyItemsModal } from '@/components/quotations/QuotationCopyItemsModal'
import { SkeletonQuotationDetail } from '@/app/components/ui/SkeletonQuotationDetail'
import {
  buildAtomicConflictRecord,
  buildItemFieldBase,
  buildItemFieldsBase,
  FieldConflictDetail,
  getItemCellKey,
  ITEM_CELL_AUTOSAVE_DELAY_MS,
  ITEM_CELL_IDLE_RELEASE_MS,
  mapItemToFormItem,
  normalizeItemFieldValue,
  PatchConflictError,
} from '@/lib/quotations/collaboration'

const sectionLabels: Record<QuotationPresenceSection, string> = {
  notas: 'Notas',
  general: 'General',
  partidas: 'Partidas',
  totales: 'Totales',
}

// Fase 6E: la garantía PRIMARIA de convergencia ya no es este latido -- son los 4
// eventos server-confirmed (item/general/totales/notas, emitidos por Postgres vía
// sendRealtimeBroadcast) más reconectar el canal y volver a la pestaña, todos
// gatillando reconciliarConServidor() de inmediato. Este intervalo queda solo como
// red de última instancia por si alguno de esos avisos se pierde (p. ej. un
// broadcast que no llega durante una reconexión que el cliente no detectó a
// tiempo) -- deliberadamente mucho menos frecuente que antes (antes 5s, la única
// garantía real) para que quede claro en el propio código que ya no es el
// mecanismo principal.
const RECONCILIACION_MS = 20_000

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function getShortName(name?: string | null, email?: string | null) {
  const cleanName = String(name || '').trim()
  if (cleanName) return cleanName.split(/\s+/).slice(0, 2).join(' ')
  const cleanEmail = String(email || '').trim()
  if (cleanEmail) return cleanEmail.split('@')[0]
  return 'Usuario'
}

export default function CotizacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session } = useSession()
  const router = useRouter()
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null)
  const [responsables, setResponsables] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aprobando, setAprobando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [driveLink, setDriveLink] = useState<string | null>(null)
  // Id estable de la fila que edita la tarjeta móvil, no su índice: un `replace()`
  // de reconciliación (alta/baja de un colaborador) cambia qué índice apunta a cuál
  // fila, y un índice guardado quedaba apuntando a la fila equivocada -- ver
  // `QuotationItemsSection`, que recalcula el índice en cada render a partir de este id.
  const [editingItemRowId, setEditingItemRowId] = useState<string | null>(null)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [importingItems, setImportingItems] = useState(false)
  const notasSectionRef = useRef<HTMLDivElement | null>(null)
  const generalSectionRef = useRef<HTMLDivElement | null>(null)
  const totalsSectionRef = useRef<HTMLDivElement | null>(null)
  const partidasSectionRef = useRef<HTMLDivElement | null>(null)
  const itemDirtyCellsRef = useRef<Set<string>>(new Set())
  const itemFocusedCellsRef = useRef<Set<string>>(new Set())
  const itemSavingCellsRef = useRef<Set<string>>(new Set())
  // Drenado real por celda: mientras una celda ya tiene una ronda de PATCH en
  // vuelo (`itemCellDrainRef`), una edición nueva sobre la MISMA celda no dispara
  // un segundo `fetch` en paralelo (rompería el orden y correría con una `base`
  // que la ronda en vuelo va a dejar vieja) -- solo marca `itemCellRetryNeededRef`
  // y el drenado, al terminar su ronda actual, ve la marca y manda una ronda más
  // con el valor final, sin volver a golpear el servidor por cada tecla. El
  // drenado completo (ronda inicial + reintentos encolados) se resuelve como una
  // sola promesa, así que `flushPendingSaves` -- y el guard de "una celda con
  // cambios locales sin confirmar" que usa `reconciliarConServidor` -- ven una
  // sola espera coherente en vez de una ronda a medias.
  const itemCellDrainRef = useRef<Map<string, Promise<unknown>>>(new Map())
  const itemCellRetryNeededRef = useRef<Set<string>>(new Set())
  const itemCellAutosaveTimersRef = useRef<Record<string, number | null>>({})
  const itemCellIdleReleaseTimersRef = useRef<Record<string, number | null>>({})
  // Último valor de cada partida confirmado por el servidor -- la fuente del "base"
  // que se manda en cada PATCH para detectar conflictos. Nunca se pisa con lo que el
  // usuario está tecleando (eso vive solo en el form).
  const itemsServerRef = useRef<Record<string, ItemCotizacion>>({})
  // "base" ya capturado por celda (al enfocarla), listo para el próximo PATCH.
  const itemCellBaseRef = useRef<Record<string, Record<string, unknown>>>({})
  const [itemCellConflicts, setItemCellConflicts] = useState<Record<string, Record<string, FieldConflictDetail>>>({})
  // mutation_id de los PATCH de partida que este cliente mismo mandó -- así al
  // recibir el `item_confirmed` del servidor se distingue "confirmó lo mío" (no hace
  // falta reconciliar, ya se aplicó al recibir la respuesta del PATCH) de "confirmó lo
  // de alguien más" (sí conviene reconciliar ya, sin esperar el heartbeat de 5s).
  const ownItemMutationIdsRef = useRef<Set<string>>(new Set())
  const rememberOwnItemMutationId = useCallback((mutationId: string) => {
    const set = ownItemMutationIdsRef.current
    set.add(mutationId)
    if (set.size > 50) {
      const oldest = set.values().next().value
      if (oldest !== undefined) set.delete(oldest)
    }
  }, [])
  // Cola por fila: encadena PATCH/DELETE de una misma partida para que no se pisen.
  const rowMutationQueueRef = useRef<Map<string, Promise<unknown>>>(new Map())
  // Filas ya quitadas en pantalla cuyo DELETE sigue en vuelo. `useFieldArray.remove`
  // trabaja sobre el snapshot del último render, así que dos borrados seguidos (antes
  // de que React repinte) dejaban una fila fantasma. Con este conjunto la lista se
  // recalcula entera y `replace` la aplica de golpe, sin depender de índices.
  const pendingRowRemovalsRef = useRef<Set<string>>(new Set())
  // Fase 6B: la fila nace con su id definitivo (crypto.randomUUID() en el cliente,
  // ver handleAddRow) y ese id NUNCA cambia -- no hay id provisional que migrar.
  // Esto solo trackea si el POST de alta de una fila sigue en vuelo, para que un
  // PATCH/DELETE disparado en la ventana entre "se pintó" y "el servidor la
  // conoce" espere en vez de fallar con 404.
  const pendingRowCreationsRef = useRef<Map<string, Promise<void>>>(new Map())
  // Instante de la última escritura local por celda. Cualquier dato del servidor
  // pedido ANTES de esa marca llega viejo y no debe aplicarse a esa celda.
  const localWriteAtRef = useRef<Map<string, number>>(new Map())

  // EF-3 3D-1: extraído a hooks/useQuotationMutationTracker.ts -- ver ese
  // archivo para la explicación completa de por qué existe.
  const { pendingMutationsRef, trackMutation } = useQuotationMutationTracker()
  // `flushPendingSaves` en sí se define más abajo (línea ~985), después de
  // `flushGeneralDirtyFields`/`flushTotalsDirtyFields`/`flushItemCellDirtyFields`/
  // `persistNotasAutosave` -- los necesita todos y en este punto del componente
  // todavía no existen.
  const flushInFlightRef = useRef<Promise<boolean> | null>(null)

  const markLocalWrite = useCallback((rowId: string, field: QuotationItemCellField) => {
    localWriteAtRef.current.set(getItemCellKey(rowId, field), Date.now())
  }, [])
  const recordServerItem = useCallback((item: ItemCotizacion) => {
    itemsServerRef.current[item.id] = item
  }, [])
  const clearItemCellConflict = useCallback((rowId: string, field: QuotationItemCellField) => {
    const key = getItemCellKey(rowId, field)
    setItemCellConflicts((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const { register, control, watch, reset, setValue, getValues } = useForm<QuotationFormValues>({
    defaultValues: { cliente: '', proyecto: '', fecha_entrega: '', locacion: '', items: [{ ...EMPTY_QUOTATION_ITEM }] },
  })
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')
  const quotationForm = useQuotationForm(setValue, watchedItems)
  const {
    refreshCatalogos,
    calcItem,
    handleClienteChange,
    handleProyectoChange,
    handleDescripcionChange,
    seleccionarProducto,
    seleccionarCliente,
    seleccionarProyecto,
    listaClientes,
    clienteInput,
    setClienteInput,
    clienteSugerencias,
    mostrarClienteDropdown,
    setMostrarClienteDropdown,
    proyectosDelCliente,
    proyectoInput,
    setProyectoInput,
    mostrarProyectoDropdown,
    setMostrarProyectoDropdown,
    productoSugerencias,
    mostrarProductoDropdown,
    setMostrarProductoDropdown,
  } = quotationForm

  const esEditable = cotizacion?.estado === 'BORRADOR' || cotizacion?.estado === 'EMITIDA'
  const {
    onlineUsers,
    sectionEditors,
    itemCellEditors,
    latestItemConfirmed,
    latestGeneralConfirmed,
    latestTotalesConfirmed,
    latestNotasConfirmed,
    setActiveSection,
    releaseSection,
    lockItemCell,
    releaseItemCell,
    isConnected,
  } = useQuotationPresence({
    cotizacionId: id,
    enabled: !!esEditable,
    currentUser: {
      id: (session?.user as { id?: string | null } | undefined)?.id,
      email: session?.user?.email,
      name: session?.user?.name,
    },
  })

  // EF-3 3D-2: extraído a hooks/useQuotationGeneralAutosave.ts -- ver ese
  // archivo para la explicación completa de por qué existe.
  const {
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
  } = useQuotationGeneralAutosave({
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
  })

  // EF-3 3D-3: extraído a hooks/useQuotationTotalesAutosave.ts -- ver ese
  // archivo para la explicación completa de por qué existe.
  const {
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
  } = useQuotationTotalesAutosave({
    id,
    cotizacion,
    esEditable,
    trackMutation,
    setCotizacion,
    setError,
    setActiveSection,
    releaseSection,
    totalsSectionRef,
  })

  // EF-3 3D-4: extraído a hooks/useQuotationNotasAutosave.ts -- ver ese
  // archivo para la explicación completa de por qué existe.
  const {
    notasInternas,
    notasDirtyRef,
    notasLockHeldRef,
    persistNotasAutosave,
    applyNotasOnly,
    handleNotasFocus,
    handleNotasBlur,
    trackedHandleNotasChange,
    clearNotasIdleReleaseTimer,
    resetNotasFromServer,
  } = useQuotationNotasAutosave({
    id,
    cotizacion,
    esEditable,
    trackMutation,
    setCotizacion,
    setError,
    setActiveSection,
    releaseSection,
    notasSectionRef,
  })

  const getItemIndexByRowId = useCallback((rowId: string) => { const items = getValues('items') || []; return items.findIndex((item) => item?.id === rowId) }, [getValues])
  const hasLocalItemRowActivity = useCallback((rowId: string) => (
    Array.from(itemDirtyCellsRef.current).some((key) => key.startsWith(`${rowId}:`)) || Array.from(itemFocusedCellsRef.current).some((key) => key.startsWith(`${rowId}:`)) || Array.from(itemSavingCellsRef.current).some((key) => key.startsWith(`${rowId}:`))
  ), [])

  const clearItemCellAutosaveTimer = useCallback((key: string) => { const timer = itemCellAutosaveTimersRef.current[key]; if (timer !== null && timer !== undefined) { window.clearTimeout(timer); delete itemCellAutosaveTimersRef.current[key] } }, [])
  const clearItemCellIdleReleaseTimer = useCallback((key: string) => { const timer = itemCellIdleReleaseTimersRef.current[key]; if (timer !== null && timer !== undefined) { window.clearTimeout(timer); delete itemCellIdleReleaseTimersRef.current[key] } }, [])

  const scheduleItemCellIdleRelease = useCallback((rowId: string, field: QuotationItemCellField) => { const key = getItemCellKey(rowId, field); clearItemCellIdleReleaseTimer(key); itemCellIdleReleaseTimersRef.current[key] = window.setTimeout(() => { delete itemCellIdleReleaseTimersRef.current[key]; if (itemDirtyCellsRef.current.has(key) || itemSavingCellsRef.current.has(key)) return; itemFocusedCellsRef.current.delete(key); releaseItemCell(rowId, field) }, ITEM_CELL_IDLE_RELEASE_MS) }, [clearItemCellIdleReleaseTimer, releaseItemCell])

  // Toda mutación de una fila entra en su propia cola: dos borrados seguidos, o un
  // PATCH y un DELETE de la misma partida, se ejecutan en orden y nunca se solapan.
  const enqueueRowMutation = useCallback(<T,>(rowId: string, run: () => Promise<T>): Promise<T> => {
    const queue = rowMutationQueueRef.current
    const previous = queue.get(rowId) ?? Promise.resolve()
    const result = previous.then(run, run)
    const settled = result.then(() => undefined, () => undefined)
    queue.set(rowId, settled)
    void settled.then(() => { if (queue.get(rowId) === settled) queue.delete(rowId) })
    return result
  }, [])

  // Si el POST de alta de esta fila sigue en vuelo, espera a que termine antes de
  // seguir: el id ya es el definitivo (Fase 6B), pero el servidor puede no
  // conocerlo todavía si el usuario edita en la ventana entre "se pintó" y "el
  // POST respondió".
  const awaitRowCreation = useCallback(async (rowId: string): Promise<void> => {
    const pending = pendingRowCreationsRef.current.get(rowId)
    if (pending) await pending
  }, [])

  // Fase 8.7 (Bloque 1): `trackMutation` YA NO envuelve el `fetch()` de aquí --
  // lo envuelve quien llama a esta función (persistItemCellAutosave), sobre la
  // promesa completa (fetch + parseo + chequeo de status). `fetch()` resuelve
  // (fulfilled) en cuanto llegan las cabeceras, sin importar el status: si se
  // trackeaba el `fetch()` crudo, un 409/500 nunca llegaba a verse como
  // rechazo desde `flushPendingSaves`, que es justo el bug que este bloque
  // cierra. Trackear la función completa (que sí hace `throw` más abajo) es lo
  // que hace que el flush detecte el fallo de verdad.
  const patchQuotationItem = useCallback(async (
    rowId: string,
    patch: Record<string, unknown>,
    options?: { base?: Record<string, unknown> | null; mutationId?: string }
  ) => {
    await awaitRowCreation(rowId)
    const body: Record<string, unknown> = { ...patch }
    if (options?.base) body.base = options.base
    if (options?.mutationId) body.mutation_id = options.mutationId
    const response = await fetch(`/api/cotizaciones/${id}/items/${rowId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (response.status === 409 && data?.error === 'conflict') {
      throw new PatchConflictError((data?.fields || {}) as Record<string, FieldConflictDetail>)
    }
    // Fase 8.7.1: `estado_invalido` (cotización ya no BORRADOR/EMITIDA) trae
    // un `message` legible aparte del código en `error` -- se prefiere ese.
    if (!response.ok) throw new Error(data?.message || data?.error || 'Error actualizando partida')
    return data?.item as ItemCotizacion | undefined
  }, [awaitRowCreation, id])

  // El id ya lo generó el cliente (Fase 6B, ver handleAddRow) -- el POST solo lo
  // valida y lo usa como llave del insert. `upsertItems` en el servidor hace que
  // reintentar con el mismo id converja al mismo estado, no cree una fila doble.
  const createQuotationItemRow = useCallback(async (rowId: string, mutationId: string) => {
    const response = await fetch(`/api/cotizaciones/${id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rowId, mutation_id: mutationId }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.message || data?.error || 'Error creando partida')
    return data?.item as ItemCotizacion | undefined
  }, [id])

  const deleteQuotationItemRow = useCallback(async (rowId: string) => {
    await awaitRowCreation(rowId)
    const response = await fetch(`/api/cotizaciones/${id}/items/${rowId}`, { method: 'DELETE' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.message || data?.error || 'Error eliminando partida')
  }, [awaitRowCreation, id])

  // `preserveLocalEdits` evita que la respuesta del servidor sobreescriba una celda
  // que el usuario sigue editando: si se tecleó durante el debounce + el round-trip,
  // el valor viejo del servidor borraba lo recién escrito.
  const upsertLocalItemState = useCallback((item: ItemCotizacion, options?: { preserveLocalEdits?: boolean; allowInsert?: boolean }) => {
    recordServerItem(item)
    const index = getItemIndexByRowId(item.id)
    const formItem = mapItemToFormItem(item)
    if (index >= 0) {
      const preserve = options?.preserveLocalEdits === true
      const isCellBusy = (field: QuotationItemCellField) => {
        if (!preserve) return false
        const key = getItemCellKey(item.id, field)
        return itemDirtyCellsRef.current.has(key) || itemFocusedCellsRef.current.has(key)
      }
      setValue(`items.${index}.id`, formItem.id)
      if (!isCellBusy('categoria')) setValue(`items.${index}.categoria`, formItem.categoria)
      if (!isCellBusy('descripcion')) setValue(`items.${index}.descripcion`, formItem.descripcion)
      if (!isCellBusy('cantidad')) setValue(`items.${index}.cantidad`, formItem.cantidad)
      if (!isCellBusy('precio_unitario')) setValue(`items.${index}.precio_unitario`, formItem.precio_unitario)
      if (!isCellBusy('x_pagar')) setValue(`items.${index}.x_pagar`, formItem.x_pagar)
      if (!isCellBusy('responsable_id')) {
        setValue(`items.${index}.responsable_id`, formItem.responsable_id)
        setValue(`items.${index}.responsable_nombre`, formItem.responsable_nombre)
      }
    } else if (options?.allowInsert) {
      // Nunca robar el foco por un cambio ajeno (ver nota en el efecto de mutaciones).
      // Solo un cambio remoto puede insertar una fila que aún no tenemos. Un ACK de
      // una petición propia nunca crea filas: si la fila ya no está en el formulario
      // es porque se borró, y reañadirla la resucitaba como fila fantasma.
      append(formItem, { shouldFocus: false })
    } else {
      return
    }
    setCotizacion((prev) => {
      if (!prev) return prev
      const items = [...(prev.items || [])]
      const existingIndex = items.findIndex((entry) => entry.id === item.id)
      if (existingIndex >= 0) items[existingIndex] = item
      else items.push(item)
      return { ...prev, items }
    })
  }, [append, getItemIndexByRowId, recordServerItem, setValue])

  const applyCotizacionToState = useCallback((cot: Cotizacion) => {
    setCotizacion(cot)
    resetNotasFromServer(cot)
    resetGeneralFromServer(cot)
    resetTotalsFromServer(cot)
    for (const item of cot.items || []) recordServerItem(item)
    reset({ cliente: cot.cliente, proyecto: cot.proyecto, fecha_entrega: cot.fecha_entrega || '', locacion: cot.locacion || '', items: (cot.items || []).map(mapItemToFormItem) })
  }, [recordServerItem, reset, resetGeneralFromServer, resetNotasFromServer, resetTotalsFromServer])

  // applyNotasOnly: EF-3 3D-4, ver hooks/useQuotationNotasAutosave.ts.
  // applyGeneralOnly: EF-3 3D-2, ver hooks/useQuotationGeneralAutosave.ts.
  // applyTotalsOnly: EF-3 3D-3, ver hooks/useQuotationTotalesAutosave.ts.

  // EF-3 3D-6: extraído a hooks/useQuotationReconciliation.ts -- ver ese
  // archivo para la explicación completa de por qué existe. 3D-5 (extracción
  // del clúster de partidas) no corrió todavía -- el hook recibe los refs de
  // partidas tal cual siguen viviendo aquí, en vez de desde un hook propio.
  const { resyncPartidas, reconciliarConServidor } = useQuotationReconciliation({
    id,
    getValues,
    setValue,
    append,
    replace,
    setCotizacion,
    recordServerItem,
    hasLocalItemRowActivity,
    itemDirtyCellsRef,
    itemFocusedCellsRef,
    itemSavingCellsRef,
    localWriteAtRef,
    pendingRowCreationsRef,
    pendingRowRemovalsRef,
    applyCotizacionToState,
    notasLockHeldRef,
    notasDirtyRef,
    applyNotasOnly,
    generalLockHeldRef,
    generalDirtyRef,
    applyGeneralOnly,
    totalsLockHeldRef,
    totalsDirtyRef,
    applyTotalsOnly,
  })

  useEffect(() => { refreshCatalogos() }, [refreshCatalogos])

  useEffect(() => {
    Promise.all([fetchQuotationDetail(id), fetchProveedores()]).then(([cot, resp]) => { applyCotizacionToState(cot); setResponsables(resp); setLoading(false); const pending = sessionStorage.getItem('pdf_drive_result'); if (pending) { sessionStorage.removeItem('pdf_drive_result'); try { const { link } = JSON.parse(pending); setSuccess('PDF guardado exitosamente en Drive'); setDriveLink(link ?? null) } catch {} } }).catch(() => setLoading(false))
  }, [id, applyCotizacionToState])

  // `fields[i].id` es la key autogenerada de `useFieldArray` para React, no el
  // `id` de negocio pasado a `append()` -- un join por esa key nunca encuentra
  // nada real. `useWatch` sí devuelve el array vivo con los valores e ids de
  // negocio actuales, incluida una fila recién agregada, sin depender de que el
  // array se vuelva a registrar (a diferencia de `watch('items')`, que devuelve
  // los valores del último `append`/`reset` hasta que RHF re-registra el campo).
  // Solo para este cálculo -- `fields` sigue siendo exclusivamente la key de
  // remonte de `useFieldArray`.
  const liveItemsForTotals = useWatch({ control, name: 'items' })
  const itemsParaTotales = useMemo(
    () => (liveItemsForTotals ?? []) as QuotationFormValues['items'],
    [liveItemsForTotals]
  )
  const totales = useMemo(() => calculateQuotationTotals({ items: itemsParaTotales, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor }), [itemsParaTotales, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor])
  const displayTotales = useMemo(() => esEditable && cotizacion ? totales : (cotizacion ? buildReadOnlyTotals(cotizacion) : totales), [esEditable, cotizacion, totales])
  const estimatedTaxes = useMemo(() => calculateEstimatedTaxes(itemsParaTotales, displayTotales), [itemsParaTotales, displayTotales])

  // Fase 8.7 (Bloque 1): ya no es `async`/try-catch -- devuelve directamente
  // `p`, la promesa trackeada (rechaza en 409/500 igual que antes), con el
  // manejo de UI adjunto vía `.then(onFulfilled, onRejected)` en vez de
  // `await` + `catch`. Así el caller (flushPendingSaves) puede capturar `p` y
  // ver su rechazo real, y quien dispara esto sin esperarlo (el timer de
  // debounce, el blur) sigue sin generar un rechazo no manejado, porque el
  // handler queda adjunto en el mismo tick en que se crea la promesa.
  // persistNotasAutosave: EF-3 3D-4, ver hooks/useQuotationNotasAutosave.ts.

  // getTotalsFieldValue/sendTotalsFieldPatchRound/persistTotalsFieldAutosave/
  // markTotalsFieldDirty/flushTotalsDirtyFields/resolveTotalsFieldConflict:
  // EF-3 3D-3, ver hooks/useQuotationTotalesAutosave.ts.

  /**
   * Una ronda de PATCH para una celda: arma el patch, lo manda, y aplica éxito
   * o conflicto. NUNCA se llama sola desde fuera -- `persistItemCellAutosave`
   * la envuelve en un drenado real (ver abajo) para que, si llegan varias
   * ediciones a la misma celda mientras una ronda sigue en vuelo, se manden en
   * secuencia (nunca en paralelo) y con la `base` ya refrescada por la ronda
   * anterior.
   *
   * Causa E: en éxito, refresca `itemCellBaseRef` al valor recién confirmado
   * (antes solo `upsertLocalItemState` tocaba el form, nunca el `base` -- así
   * que seguir editando la MISMA celda sin blur después de un autoguardado
   * mandaba la próxima ronda con un `base` ya viejo y producía un 409 contra
   * uno mismo).
   *
   * Causa I: si el `base` nunca se capturó (primera edición de una fila nueva,
   * antes de que su POST confirme y `itemsServerRef` se pueble), se reconstruye
   * aquí en vez de mandar el PATCH sin comparación.
   */
  const sendItemCellPatchRound = useCallback(async (rowId: string, field: QuotationItemCellField): Promise<unknown> => {
    const key = getItemCellKey(rowId, field)
    try {
      await awaitRowCreation(rowId)
    } catch (creationError: unknown) {
      // El alta de la fila falló (ver handleAddRow) -- no hay fila a la que
      // mandarle este PATCH. Se rechaza aquí mismo (no se llega a construir
      // `patch` ni a llamar al servidor) para que el drenado de
      // `persistItemCellAutosave` rechace limpio en vez de un 404 confuso.
      setError(creationError instanceof Error ? creationError.message : 'Error creando partida')
      throw creationError
    }
    let base = itemCellBaseRef.current[key]
    if (base === undefined) {
      const freshBase = buildItemFieldBase(itemsServerRef.current[rowId], field)
      if (freshBase) { base = freshBase; itemCellBaseRef.current[key] = freshBase }
    }
    clearItemCellAutosaveTimer(key)
    const index = getItemIndexByRowId(rowId)
    if (index < 0) return undefined
    const item = getValues(`items.${index}`)
    if (!item) return undefined
    const patch: Record<string, unknown> = field === 'categoria' ? { categoria: item.categoria || '' }
      : field === 'descripcion' ? { descripcion: item.descripcion || '' }
      : field === 'cantidad' ? { cantidad: Number(item.cantidad) || 0 }
      : field === 'precio_unitario' ? { precio_unitario: item.precio_unitario === '' ? 0 : Number(item.precio_unitario) || 0 }
      : field === 'x_pagar' ? { x_pagar: item.x_pagar === '' ? 0 : Number(item.x_pagar) || 0 }
      : { responsable_id: item.responsable_id || '', responsable_nombre: item.responsable_nombre || '' }
    const mutationId = crypto.randomUUID()
    rememberOwnItemMutationId(mutationId)
    // La promesa CRUDA de `patchQuotationItem` rechaza en CUALQUIER 409, incluido
    // el conflicto "idéntico" que la rama de abajo resuelve sola. `trackMutation`
    // debe registrar la promesa SEMÁNTICA (`semantic`, tras aplicar esa
    // resolución), no la cruda -- si no, `flushPendingSaves` vería un
    // conflicto ya auto-resuelto como una mutación fallida y abortaría
    // Generar/Aprobar sin motivo real.
    const rawPatch = patchQuotationItem(rowId, patch, { base, mutationId })
    const semantic = rawPatch.then(
      (updatedItem) => {
        markLocalWrite(rowId, field)
        // Causa F (hueco de la ronda de revisión): si ya hay un reintento
        // encolado (`itemCellRetryNeededRef`), esta ronda que acaba de
        // resolver ya está desactualizada frente a una edición más nueva --
        // limpiar `itemDirtyCellsRef` acá dejaría a `upsertLocalItemState`
        // (justo abajo, con `preserveLocalEdits: true`) creer que la celda
        // ya no está "ocupada" y pisar el valor recién tecleado con el
        // `updatedItem` de ESTA ronda (viejo). El drenado de
        // `persistItemCellAutosave` va a mandar la ronda siguiente con el
        // valor correcto -- recién esa, al no encontrar más reintentos
        // pendientes, limpia el dirty de verdad.
        if (!itemCellRetryNeededRef.current.has(key)) {
          itemDirtyCellsRef.current.delete(key)
        }
        clearItemCellConflict(rowId, field)
        // El valor canónico es `updatedItem` (lo que el servidor confirmó),
        // no el `patch` que se mandó -- evita que una diferencia de
        // redondeo/formato entre lo mandado y lo almacenado deje `base`
        // desincronizado del valor real en la base de datos.
        const freshBase = updatedItem ? buildItemFieldBase(updatedItem, field) : null
        itemCellBaseRef.current[key] = freshBase ?? patch
        if (updatedItem) {
          upsertLocalItemState(updatedItem, { preserveLocalEdits: true })
        }
        scheduleItemCellIdleRelease(rowId, field)
        return updatedItem
      },
      (saveError: unknown) => {
        if (saveError instanceof PatchConflictError) {
          // Si nadie cambió nada realmente (lo que el usuario intentó guardar es
          // idéntico a lo que el servidor ya tiene, comparado sin importar
          // representación -- causa G), no hay nada que decidir -- se resuelve
          // solo, igual que "Usar" pero sin mostrar el banner.
          const detail = saveError.fields[field]
          if (detail && normalizeItemFieldValue(field, detail.attempted) === normalizeItemFieldValue(field, detail.current)) {
            itemsServerRef.current[rowId] = { ...(itemsServerRef.current[rowId] || ({} as ItemCotizacion)), [field]: detail.current }
            itemCellBaseRef.current[key] = { [field]: detail.current }
            // Mismo motivo que la rama de éxito de arriba: no limpiar dirty
            // si ya hay un reintento encolado con un valor más nuevo.
            if (!itemCellRetryNeededRef.current.has(key)) {
              itemDirtyCellsRef.current.delete(key)
            }
            scheduleItemCellIdleRelease(rowId, field)
            return undefined
          }
          // Conflicto real: nunca se descarta en silencio lo que el usuario
          // tecleó -- la fila queda tal cual, se muestra el conflicto y el
          // usuario decide. `itemDirtyCellsRef` NO se limpia a propósito (sigue
          // bloqueando Generar/Aprobar) y el error se relanza para que el
          // drenado de `persistItemCellAutosave` rechace y `flushPendingSaves`
          // vea la falla real.
          setItemCellConflicts((prev) => ({ ...prev, [key]: saveError.fields }))
          throw saveError
        }
        setError(saveError instanceof Error ? saveError.message : 'Error guardando partida')
        throw saveError
      }
    )
    return trackMutation(semantic)
  }, [awaitRowCreation, clearItemCellAutosaveTimer, clearItemCellConflict, getItemIndexByRowId, getValues, markLocalWrite, patchQuotationItem, rememberOwnItemMutationId, scheduleItemCellIdleRelease, upsertLocalItemState, trackMutation])

  /**
   * Drenado real por celda (causa F): como máximo una ronda de PATCH en vuelo
   * por celda. Si llega una edición nueva mientras una ronda ya está en curso,
   * no dispara un segundo `fetch` en paralelo -- marca `itemCellRetryNeededRef`
   * y el `do...while` manda una ronda más en cuanto la actual resuelve, con el
   * valor final del form en ese momento. Todo el drenado (ronda inicial +
   * reintentos encolados) es UNA sola promesa: quien llama antes de que
   * termine (otra tecla, `flushItemCellDirtyFields`) recibe esa misma promesa
   * en vez de disparar otra ronda por su cuenta.
   */
  const persistItemCellAutosave = useCallback((rowId: string, field: QuotationItemCellField): Promise<unknown> => {
    const key = getItemCellKey(rowId, field)
    const existing = itemCellDrainRef.current.get(key)
    if (existing) {
      itemCellRetryNeededRef.current.add(key)
      return existing
    }
    itemSavingCellsRef.current.add(key)
    const drain = (async () => {
      let result: unknown
      do {
        itemCellRetryNeededRef.current.delete(key)
        result = await sendItemCellPatchRound(rowId, field)
      } while (itemCellRetryNeededRef.current.has(key))
      return result
    })().finally(() => {
      itemSavingCellsRef.current.delete(key)
      itemCellDrainRef.current.delete(key)
    })
    // Nadie más que `flushPendingSaves` (vía `Promise.allSettled`) tiene por qué
    // esperar este drenado -- los demás callers lo disparan "fire and forget"
    // (`void persistItemCellAutosave(...)`) desde un debounce o un blur. Sin
    // este `catch` mudo, un conflicto real (que a propósito rechaza el
    // drenado) se reportaría como unhandled rejection en la consola aunque el
    // banner de conflicto ya se haya mostrado -- mismo patrón que `trackMutation`
    // usa arriba para su propia promesa derivada.
    drain.catch(() => {})
    itemCellDrainRef.current.set(key, drain)
    return drain
  }, [sendItemCellPatchRound])

  // Fase 8.7 (Bloque 1): equivalente a flushGeneralDirtyFields/
  // flushTotalsDirtyFields, para partidas -- fuerza cualquier celda con una
  // edición todavía esperando su debounce de 800ms y devuelve las promesas
  // reales para que flushPendingSaves las incluya en su foto.
  // Fase 8.7.2 (causa F): itera la UNIÓN de `itemDirtyCellsRef` y
  // `itemCellDrainRef.keys()`, no solo dirty -- así un drenado ya en curso se
  // ve aunque su ronda actual haya limpiado `itemDirtyCellsRef` un instante
  // antes de que esto corra. A propósito NO marca `itemCellRetryNeededRef` por
  // su cuenta (generaría un PATCH redundante en cada Generar/Aprobar).
  const flushItemCellDirtyFields = useCallback((): Promise<unknown>[] => {
    const disparadas: Promise<unknown>[] = []
    const keys = new Set([...Array.from(itemDirtyCellsRef.current), ...Array.from(itemCellDrainRef.current.keys())])
    for (const key of Array.from(keys)) {
      const existingDrain = itemCellDrainRef.current.get(key)
      if (existingDrain) { disparadas.push(existingDrain); continue }
      if (!itemDirtyCellsRef.current.has(key)) continue
      const [rowId, field] = key.split(':') as [string, QuotationItemCellField]
      clearItemCellAutosaveTimer(key)
      disparadas.push(persistItemCellAutosave(rowId, field))
    }
    return disparadas
  }, [clearItemCellAutosaveTimer, persistItemCellAutosave])

  // Fase 8.7 (Bloque 1): definida aquí porque necesita flushGeneralDirtyFields/
  // flushTotalsDirtyFields/flushItemCellDirtyFields/persistNotasAutosave, todos
  // declarados arriba en este mismo componente -- ver la nota junto a
  // `pendingMutationsRef`/`trackMutation` más arriba.
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

  // Debounce de Notas: EF-3 3D-4, ver hooks/useQuotationNotasAutosave.ts.
  // General y Totales ya no tienen un debounce por sección: `markGeneralFieldDirty`/
  // `markTotalsFieldDirty` programan su propio timeout por campo en cuanto se
  // detecta la edición (ver los `tracked*` handlers más abajo).

  // Fase 6E: el refresco de notas/general/totales tras un guardado ajeno ya no
  // depende de un aviso del navegador que guardó (`section_saved`, retirado --
  // Presence ahora es pura awareness, sin ese canal). `latestNotasConfirmed`/
  // `latestGeneralConfirmed`/`latestTotalesConfirmed` (más abajo) cubren exactamente
  // el mismo caso desde el SERVIDOR, disparando reconciliarConServidor() -- que ya
  // aplica notas/general/totales con las mismas guardas de dirty/foco que tenían
  // applyNotasOnly/applyGeneralOnly/applyTotalsOnly aquí, así que no hay pérdida de
  // cobertura, solo una fuente de verdad menos redundante.

  // Alta/edición/baja/bulk de otro colaborador llegan por `item_confirmed` (más abajo):
  // el servidor confirma DESPUÉS de commitear en Postgres y dispara una relectura
  // completa vía `reconciliarConServidor()`, que ya reconstruye altas y bajas sola. Este
  // efecto reconecta el canal como red de seguridad si se perdió la conexión.
  const estabaConectadoRef = useRef(isConnected)
  useEffect(() => {
    const acabaDeReconectar = isConnected && !estabaConectadoRef.current
    estabaConectadoRef.current = isConnected
    if (acabaDeReconectar) void reconciliarConServidor()
  }, [isConnected, reconciliarConServidor])

  // `item_confirmed`/`general_confirmed`/`totales_confirmed`: los emite el servidor
  // recién commiteado el PATCH (ver lib/server/realtime/broadcast.ts). Sirven para
  // reconciliar de inmediato en vez de esperar el heartbeat de 5s -- nunca reemplazan
  // la reconciliación periódica, solo la adelantan.
  useEffect(() => {
    if (!latestItemConfirmed) return
    // Confirmó un PATCH propio: ya se aplicó al recibir la respuesta del fetch: no
    // hace falta reconciliar otra vez. Sin mutation_id (ajeno, o un cliente viejo) sí.
    if (latestItemConfirmed.mutation_id && ownItemMutationIdsRef.current.has(latestItemConfirmed.mutation_id)) return
    void reconciliarConServidor()
  }, [latestItemConfirmed, reconciliarConServidor])

  useEffect(() => {
    if (!latestGeneralConfirmed) return
    void reconciliarConServidor()
  }, [latestGeneralConfirmed, reconciliarConServidor])

  useEffect(() => {
    if (!latestTotalesConfirmed) return
    void reconciliarConServidor()
  }, [latestTotalesConfirmed, reconciliarConServidor])

  // Notas gana su propio evento server-confirmed desde Fase 6A -- es el único camino
  // que refresca notas tras un guardado ajeno desde que Fase 6E retiró `section_saved`.
  useEffect(() => {
    if (!latestNotasConfirmed) return
    void reconciliarConServidor()
  }, [latestNotasConfirmed, reconciliarConServidor])

  // Red de última instancia, NO la garantía primaria (ver RECONCILIACION_MS arriba).
  // No depende de la presencia ni del canal: si dependiera, un fallo de esos mismos
  // mecanismos volvería a dejar las pantallas divergentes sin que nadie se entere.
  useEffect(() => {
    if (!esEditable) return
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void reconciliarConServidor()
    }
    const timer = window.setInterval(tick, RECONCILIACION_MS)
    return () => window.clearInterval(timer)
  }, [esEditable, reconciliarConServidor])

  // Volver a la pestaña es el momento en que más se nota quedarse con datos viejos.
  useEffect(() => {
    if (!esEditable || typeof document === 'undefined') return
    const alVolver = () => { if (document.visibilityState === 'visible') void reconciliarConServidor() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [esEditable, reconciliarConServidor])

  useEffect(() => () => {
    clearNotasIdleReleaseTimer(); clearGeneralIdleReleaseTimer(); clearTotalsIdleReleaseTimer()
    Object.values(itemCellAutosaveTimersRef.current).forEach((timer) => timer && window.clearTimeout(timer))
    Object.values(itemCellIdleReleaseTimersRef.current).forEach((timer) => timer && window.clearTimeout(timer))
    clearAllGeneralFieldTimers()
    clearAllTotalsFieldTimers()
  }, [clearAllGeneralFieldTimers, clearAllTotalsFieldTimers, clearGeneralIdleReleaseTimer, clearNotasIdleReleaseTimer, clearTotalsIdleReleaseTimer])

  // handleNotasFocus/handleNotasBlur: EF-3 3D-4, ver hooks/useQuotationNotasAutosave.ts.
  // handleTotalsFocus/handleTotalsBlur: EF-3 3D-3, ver hooks/useQuotationTotalesAutosave.ts.

  // Sin esto, tocar la tabla una vez te dejaba marcado como editor de Partidas para
  // los demás indefinidamente: era la única sección sin liberación al salir.
  const handlePartidasBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!esEditable) return
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && partidasSectionRef.current?.contains(nextTarget)) return
    window.setTimeout(() => {
      const activeElement = document.activeElement
      if (activeElement && partidasSectionRef.current?.contains(activeElement)) return
      releaseSection('partidas')
    }, 0)
  }, [esEditable, releaseSection])

  // handleGeneralFocus/handleGeneralBlur/tracked*: EF-3 3D-2, ver
  // hooks/useQuotationGeneralAutosave.ts.
  // trackedSetPorcentajeFee/trackedSetIvaActivo/trackedSetDescuentoTipo/
  // trackedSetDescuentoValor: EF-3 3D-3, ver hooks/useQuotationTotalesAutosave.ts.

  const handleItemFieldFocus = useCallback((rowId: string, field: QuotationItemCellField) => {
    const key = getItemCellKey(rowId, field)
    clearItemCellIdleReleaseTimer(key)
    itemFocusedCellsRef.current.add(key)
    lockItemCell(rowId, field)
    const base = buildItemFieldBase(itemsServerRef.current[rowId], field)
    if (base) itemCellBaseRef.current[key] = base
  }, [clearItemCellIdleReleaseTimer, lockItemCell])

  const handleItemFieldChange = useCallback((rowId: string, field: QuotationItemCellField) => {
    const key = getItemCellKey(rowId, field)
    markLocalWrite(rowId, field)
    itemDirtyCellsRef.current.add(key)
    itemFocusedCellsRef.current.add(key)
    lockItemCell(rowId, field)
    clearItemCellIdleReleaseTimer(key)
    clearItemCellAutosaveTimer(key)
    // Causa F (hueco de la ronda de revisión): si ya hay un drenado en vuelo para
    // esta celda, esta tecla no dispara su propio timer -- pero el drenado en
    // vuelo puede resolver ANTES de que este debounce venza, y en éxito limpia
    // `itemDirtyCellsRef` sin que nadie haya marcado un reintento. Marcarlo aquí
    // (no solo en el guard de `persistItemCellAutosave`) es lo que hace que el
    // drenado en curso vea la marca y mande una ronda más con este valor.
    if (itemCellDrainRef.current.has(key)) itemCellRetryNeededRef.current.add(key)
    itemCellAutosaveTimersRef.current[key] = window.setTimeout(() => { void persistItemCellAutosave(rowId, field) }, ITEM_CELL_AUTOSAVE_DELAY_MS)
  }, [clearItemCellAutosaveTimer, clearItemCellIdleReleaseTimer, lockItemCell, markLocalWrite, persistItemCellAutosave])

  const handleItemFieldBlur = useCallback((rowId: string, field: QuotationItemCellField) => {
    const key = getItemCellKey(rowId, field)
    itemFocusedCellsRef.current.delete(key)
    clearItemCellAutosaveTimer(key)
    if (itemDirtyCellsRef.current.has(key)) { void persistItemCellAutosave(rowId, field); return }
    scheduleItemCellIdleRelease(rowId, field)
  }, [clearItemCellAutosaveTimer, persistItemCellAutosave, scheduleItemCellIdleRelease])

  const handleAddRow = useCallback(async () => {
    // Fase 6B: la fila nace con su id definitivo -- nunca cambia durante su vida.
    // Se pinta de inmediato con ese id; el POST (que lo valida y lo usa como
    // llave del insert) viaja detrás.
    const rowId = crypto.randomUUID()
    // Nunca robar el foco por un cambio ajeno (mismo criterio que los otros `append()`
    // de este archivo): sin `shouldFocus: false`, RHF autofoca la fila nueva y ese
    // foco dispara `setActiveSection('partidas')`/`cellFocus` para una celda que nadie
    // enfocó a propósito.
    append({ ...EMPTY_QUOTATION_ITEM, id: rowId, precio_unitario: 0, x_pagar: 0 }, { shouldFocus: false })

    // Fase 8.7.1: `trackMutation` envuelve la misma promesa que ya guarda
    // `pendingRowCreationsRef` -- así `flushPendingSaves` también la espera
    // antes de Generar/Aprobar, igual que ya hace con General/Totales/
    // Partidas/Notas. Antes, un alta de fila en vuelo era invisible para el
    // flush.
    // `mutation_id` (igual que en el PATCH): así el propio creador reconoce su
    // confirmación al recibir `item_confirmed` y no reconcilia contra sí mismo.
    const mutationId = crypto.randomUUID()
    rememberOwnItemMutationId(mutationId)
    const creation = trackMutation(createQuotationItemRow(rowId, mutationId))
    // Causa I: los `.then` de una promesa se disparan en el orden en que se
    // registraron. `recordServerItem` tenía que correr ANTES de que
    // `pendingRowCreationsRef` resolviera la fila como lista -- si no, una
    // primera edición de la celda (que llama `awaitRowCreation` y después lee
    // `itemsServerRef.current[rowId]` para reconstruir su `base`, causa I en
    // `sendItemCellPatchRound`) podía encontrar la fila todavía sin poblar en
    // `itemsServerRef`. Encadenar `recordServerItem` sobre `creation` (en
    // `rowReady`) y derivar `pendingRowCreationsRef` de `rowReady` (no de
    // `creation`) garantiza ese orden.
    // A diferencia de una versión anterior de este fix, un POST fallido debe
    // seguir rechazando aquí -- convertirlo en `undefined` dejaba
    // `pendingRowCreationsRef` resuelto como "fila lista" aunque nunca se haya
    // creado, y una edición que esperaba esa creación (`awaitRowCreation`)
    // podía seguir de largo y mandar un PATCH contra una fila inexistente.
    const rowReady = creation.then((createdItem) => {
      if (!createdItem) throw new Error('No se pudo crear la fila')
      recordServerItem(createdItem)
      return createdItem
    })
    const readyPromise = rowReady.then(() => undefined)
    // Nadie más que este mismo `try` tiene por qué esperar esta promesa --
    // si nadie edita la fila mientras el alta sigue en vuelo, un rechazo aquí
    // quedaría sin handler propio. Mismo patrón que `itemCellDrainRef`'s
    // `drain.catch(() => {})` más abajo.
    readyPromise.catch(() => {})
    pendingRowCreationsRef.current.set(rowId, readyPromise)

    try {
      const createdItem = await rowReady
      setCotizacion((prev) => prev ? { ...prev, items: [...(prev.items || []), createdItem] } : prev)
    } catch (createError: unknown) {
      const index = getItemIndexByRowId(rowId)
      if (index >= 0) remove(index)
      setError(createError instanceof Error ? createError.message : 'Error creando partida')
      void resyncPartidas()
    } finally {
      pendingRowCreationsRef.current.delete(rowId)
    }
  }, [append, createQuotationItemRow, getItemIndexByRowId, recordServerItem, rememberOwnItemMutationId, remove, resyncPartidas, trackMutation])

  const handleImportItems = useCallback(async (items: ImportableItem[]) => {
    if (items.length === 0) return
    setImportingItems(true)
    const scope = `bulk_import:${id}`
    try {
      const { cotizacion: updated } = await runIdempotentBulkImportSubmit({
        scope,
        cotizacionId: id,
        // Recalculado en cada intento (retry tras un `completed`, o el
        // envío inicial): ids ya definitivos (nuevos o reutilizados), igual
        // que ya hace el resto de la app (Fase 6B) -- esta ruta deja de ser
        // la única que generaba ids del lado del servidor.
        buildCandidatePayload: (): BulkImportPayload => {
          const reusableIds = (getValues('items') || [])
            .filter((item) => isBlankQuotationItem(item))
            .map((item) => item.id)
            .filter((rowId): rowId is string => !!rowId && !pendingRowCreationsRef.current.has(rowId))

          let nextOrder = Object.values(itemsServerRef.current).reduce((max, item) => Math.max(max, item.orden ?? 0), -1) + 1

          const rows = items.map((sourceItem, index) => {
            const reusedId = reusableIds[index]
            const existing = reusedId ? itemsServerRef.current[reusedId] : undefined
            const normalized = normalizeQuotationItem({
              id: reusedId || crypto.randomUUID(),
              categoria: String(sourceItem.categoria || ''),
              descripcion: String(sourceItem.descripcion || ''),
              cantidad: Number(sourceItem.cantidad) || 1,
              precio_unitario: Number(sourceItem.precio_unitario) || 0,
              responsable_id: sourceItem.responsable_id || '',
              responsable_nombre: sourceItem.responsable_nombre || '',
              x_pagar: Number(sourceItem.x_pagar) || 0,
            })

            return {
              id: normalized.id as string,
              categoria: normalized.categoria,
              descripcion: normalized.descripcion,
              cantidad: normalized.cantidad,
              precio_unitario: normalized.precio_unitario,
              importe: normalized.importe,
              responsable_id: normalized.responsable_id || null,
              responsable_nombre: normalized.responsable_nombre || null,
              x_pagar: normalized.x_pagar,
              margen: normalized.margen,
              orden: existing ? (existing.orden ?? nextOrder++) : nextOrder++,
              notas: existing?.notas ?? null,
            }
          })

          return {
            items: rows,
            reemplazar_ids: reusableIds.map((rowId) => ({
              id: rowId,
              revision: itemsServerRef.current[rowId]?.revision ?? 0,
            })),
            cotizacionId: id,
          }
        },
        // Fase 8.7.1: se trackea la operación completa (fetch + parseo +
        // chequeo de status), no el `fetch()` crudo, para que
        // `flushPendingSaves` espere una importación en vuelo antes de
        // Generar/Aprobar y aborte si falla.
        submit: ({ operationId, payload }) => trackMutation((async () => {
          const response = await fetch(`/api/cotizaciones/${id}/items/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: payload.items,
              reemplazar_ids: payload.reemplazar_ids,
              operation_id: operationId,
            }),
          })
          const responseBody = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(responseBody?.message || responseBody?.error || 'Error copiando partidas')
          return responseBody as { cotizacion?: Cotizacion }
        })()) as Promise<{ cotizacion?: Cotizacion }>,
      })

      // Se aplica la lista completa de una vez (nada de append + setValue, que era lo
      // que dejaba una fila fuera del subtotal). Solo se tocan partidas y totales del
      // encabezado: cliente, proyecto, notas y config de totales pueden estar en
      // edición en otra sección y no deben pisarse.
      // Las filas cuya alta sigue en vuelo siguen siendo del usuario: el servidor
      // aún no las conoce, y descartarlas las dejaba invisibles hasta recargar.
      const provisionales = (getValues('items') || []).filter((item) => item.id && pendingRowCreationsRef.current.has(item.id))
      replace([...(updated.items || []).map(mapItemToFormItem), ...provisionales])
      setCotizacion((prev) => prev ? { ...prev, items: updated.items || [], subtotal: updated.subtotal, fee_agencia: updated.fee_agencia, general: updated.general, iva: updated.iva, total: updated.total, margen_total: updated.margen_total, utilidad_total: updated.utilidad_total } : updated)
      for (const item of updated.items || []) {
        recordServerItem(item)
      }
    } catch (importError: unknown) {
      setError(importError instanceof Error ? importError.message : 'Error copiando partidas')
      void resyncPartidas()
    } finally {
      setImportingItems(false)
    }
  }, [getValues, id, recordServerItem, replace, resyncPartidas, trackMutation])

  // Borrado optimista, identificado por rowId: la fila desaparece al instante y el
  // DELETE (que recalcula el encabezado y sincroniza Sheets) corre después, encolado
  // por fila. Si falla, se resincroniza contra el servidor.
  const handleRemoveRow = useCallback(async (rowId: string) => {
    if (pendingRowRemovalsRef.current.has(rowId)) return
    if (getItemIndexByRowId(rowId) < 0) return
    pendingRowRemovalsRef.current.add(rowId)
    replace((getValues('items') || []).filter((item) => !item.id || !pendingRowRemovalsRef.current.has(item.id)))
    setCotizacion((prev) => prev ? { ...prev, items: (prev.items || []).filter((item) => item.id !== rowId) } : prev)
    try {
      // Fase 8.7.1: trackeada para que flushPendingSaves espere un borrado en
      // vuelo antes de Generar/Aprobar y aborte si falla -- antes era
      // invisible para el flush (enqueueRowMutation solo serializa contra
      // otra mutación de la misma fila, no contra la transición de estado).
      await trackMutation(enqueueRowMutation(rowId, () => deleteQuotationItemRow(rowId)))
      pendingRowRemovalsRef.current.delete(rowId)
    } catch (deleteError: unknown) {
      pendingRowRemovalsRef.current.delete(rowId)
      setError(deleteError instanceof Error ? deleteError.message : 'Error eliminando partida')
      void resyncPartidas()
    }
  }, [deleteQuotationItemRow, enqueueRowMutation, getItemIndexByRowId, getValues, replace, resyncPartidas, trackMutation])

  // Operación atómica multi-campo: manda "base" para los 4 campos que el autofill
  // toca, así la RPC la rechaza completa (ningún campo se aplica a medias) si
  // cualquiera de ellos cambió en el servidor desde el último valor confirmado que
  // este cliente conoce -- p. ej. si alguien más ya editó Precio mientras se elegía
  // el producto, el autofill NUNCA lo pisa en silencio.
  const handleSelectProduct = useCallback(async (rowId: string, producto: { descripcion: string; categoria: string | null; precio_unitario: number; x_pagar_sugerido: number }) => {
    const index = getItemIndexByRowId(rowId)
    if (index < 0) return
    const fields: QuotationItemCellField[] = ['descripcion', 'categoria', 'precio_unitario', 'x_pagar']
    const base = buildItemFieldsBase(itemsServerRef.current[rowId], fields)
    for (const field of fields) {
      const key = getItemCellKey(rowId, field)
      if (base) itemCellBaseRef.current[key] = base
      // Si alguno de estos 4 campos venía dirty de una edición manual sin blur
      // (p. ej. el usuario tecleó en descripción y eligió una sugerencia antes de
      // que el input perdiera el foco), el patch atómico de abajo ya lo cubre --
      // sin este cleanup, el blur que sigue encuentra la celda todavía dirty y
      // handleItemFieldBlur dispara su propio PATCH suelto de un solo campo,
      // corriendo en paralelo al combinado y rompiendo la atomicidad efectiva.
      clearItemCellAutosaveTimer(key)
      itemDirtyCellsRef.current.delete(key)
    }
    seleccionarProducto(rowId, producto as never)
    try {
      const mutationId = crypto.randomUUID()
      rememberOwnItemMutationId(mutationId)
      // Fase 8.7.1: trackeada -- antes este autofill era invisible para
      // flushPendingSaves, así que Generar/Aprobar podían disparar la
      // transición mientras este PATCH atómico seguía en vuelo.
      const updatedItem = await trackMutation(enqueueRowMutation(rowId, () => patchQuotationItem(rowId, { descripcion: producto.descripcion, categoria: producto.categoria || '', precio_unitario: producto.precio_unitario || 0, x_pagar: producto.x_pagar_sugerido || 0 }, { base: base ?? undefined, mutationId })))
      if (updatedItem) {
        upsertLocalItemState(updatedItem, { preserveLocalEdits: true })
        for (const field of fields) {
          clearItemCellConflict(rowId, field)
          // Refresca `base` al valor canónico que el servidor acaba de confirmar
          // -- sin esto, seguir editando cualquiera de estos 4 campos sin blur
          // después del autofill mandaba el siguiente PATCH con el `base` viejo
          // (mismo bug que causa E, pero para esta ruta atómica).
          const freshBase = buildItemFieldBase(updatedItem, field)
          if (freshBase) itemCellBaseRef.current[getItemCellKey(rowId, field)] = freshBase
        }
      }
    } catch (saveError: unknown) {
      if (saveError instanceof PatchConflictError) {
        // El mismo banner de conflicto por celda que usan las ediciones normales --
        // deja elegir, entre lo que sugirió el producto (attempted) y lo que hay
        // ahora en el servidor (current). Nada se descarta en silencio: como la
        // RPC es atómica, si hubo conflicto NINGÚN campo se guardó -- se
        // sintetiza el registro completo de los 4 (buildAtomicConflictRecord),
        // no solo los que la RPC marcó, y se guarda el MISMO registro bajo las
        // 4 claves para que cualquiera de los 4 banners resuelva el grupo entero
        // (ver resolveItemCellConflict).
        const patchAttempted = { descripcion: producto.descripcion, categoria: producto.categoria || '', precio_unitario: producto.precio_unitario || 0, x_pagar: producto.x_pagar_sugerido || 0 }
        const record = buildAtomicConflictRecord(fields, base, patchAttempted, saveError)
        // El PATCH atómico se rechazó completo -- ninguno de los 4 campos se
        // guardó, así que NO se marcan como "dirty" en itemDirtyCellsRef: ese
        // mecanismo dispara `persistItemCellAutosave` por CELDA INDIVIDUAL
        // (flushItemCellDirtyFields), lo que rompería otra vez la atomicidad
        // -- 4 PATCH de un solo campo cada uno, en vez de uno atómico de 4.
        // El bloqueo de Generar/Aprobar mientras este conflicto siga sin
        // resolver corre por `flushPendingSaves`, que revisa directamente si
        // queda algún `itemCellConflicts` sin resolver (ver más abajo).
        setItemCellConflicts((prev) => {
          const next = { ...prev }
          for (const field of fields) next[getItemCellKey(rowId, field)] = record
          return next
        })
        return
      }
      setError(saveError instanceof Error ? saveError.message : 'Error aplicando producto')
      void resyncPartidas()
    }
  }, [clearItemCellAutosaveTimer, clearItemCellConflict, enqueueRowMutation, getItemIndexByRowId, patchQuotationItem, rememberOwnItemMutationId, resyncPartidas, seleccionarProducto, trackMutation, upsertLocalItemState])

  const handleResponsableChange = useCallback(async (rowId: string, responsableId: string) => {
    const index = getItemIndexByRowId(rowId)
    if (index < 0) return
    const responsable = responsables.find((item) => item.id === responsableId)
    const fields: QuotationItemCellField[] = ['responsable_id']
    const base = buildItemFieldsBase(itemsServerRef.current[rowId], fields)
    if (base) itemCellBaseRef.current[getItemCellKey(rowId, 'responsable_id')] = base
    setValue(`items.${index}.responsable_id`, responsableId)
    setValue(`items.${index}.responsable_nombre`, responsable?.nombre ?? '')
    try {
      const mutationId = crypto.randomUUID()
      rememberOwnItemMutationId(mutationId)
      // Fase 8.7.1: trackeada, mismo motivo que handleSelectProduct arriba.
      const updatedItem = await trackMutation(enqueueRowMutation(rowId, () => patchQuotationItem(rowId, { responsable_id: responsableId, responsable_nombre: responsable?.nombre ?? '' }, { base: base ?? undefined, mutationId })))
      if (updatedItem) {
        upsertLocalItemState(updatedItem, { preserveLocalEdits: true })
        clearItemCellConflict(rowId, 'responsable_id')
        // Refresca `base` (ambos campos, `responsable_id` Y `responsable_nombre`
        // -- viajan siempre juntos) al valor canónico confirmado, mismo motivo
        // que en `handleSelectProduct`.
        const freshBase = buildItemFieldBase(updatedItem, 'responsable_id')
        if (freshBase) itemCellBaseRef.current[getItemCellKey(rowId, 'responsable_id')] = freshBase
      }
    } catch (saveError: unknown) {
      if (saveError instanceof PatchConflictError) {
        // El PATCH manda dos campos (`responsable_id` y `responsable_nombre`,
        // ver `base` arriba) pero solo `responsable_id` tiene celda propia en
        // la UI -- si SOLO `responsable_nombre` chocó (el id no cambió, pero
        // el nombre denormalizado del proveedor sí), mirar nada más
        // `fields.responsable_id` dejaba el conflicto sin banner ni forma de
        // resolverlo. Se guardan los dos, cada uno bajo su propia clave, para
        // que `resolveItemCellConflict` (abajo) actualice ambos sin mezclar un
        // nombre donde va un id.
        const detailId = saveError.fields.responsable_id
        const detailNombre = saveError.fields.responsable_nombre
        if (detailId || detailNombre) {
          setItemCellConflicts((prev) => ({
            ...prev,
            [getItemCellKey(rowId, 'responsable_id')]: {
              ...prev[getItemCellKey(rowId, 'responsable_id')],
              ...(detailId ? { responsable_id: detailId } : {}),
              ...(detailNombre ? { responsable_nombre: detailNombre } : {}),
            },
          }))
        }
        return
      }
      setError(saveError instanceof Error ? saveError.message : 'Error actualizando responsable')
      void resyncPartidas()
    }
  }, [clearItemCellConflict, enqueueRowMutation, getItemIndexByRowId, patchQuotationItem, rememberOwnItemMutationId, resyncPartidas, responsables, setValue, trackMutation, upsertLocalItemState])

  /**
   * "Mantener lo mío" sobre un conflicto de un PATCH atómico multi-campo
   * (autofill de producto): reintenta el PATCH COMPLETO con TODOS los campos
   * del grupo -- nunca uno solo, o se pierde la atomicidad otra vez (el
   * drenado genérico de `persistItemCellAutosave` solo sabe mandar un campo a
   * la vez). Usa los valores ACTUALES del form (lo que el usuario sigue
   * viendo, sin tocar) y el `base` ya refrescado por `resolveItemCellConflict`
   * a los valores reales del servidor.
   */
  const retryItemGroupPatch = useCallback(async (rowId: string, groupFields: QuotationItemCellField[]) => {
    const index = getItemIndexByRowId(rowId)
    if (index < 0) return
    const item = getValues(`items.${index}`)
    if (!item) return
    const patch: Record<string, unknown> = {}
    for (const field of groupFields) {
      patch[field] = field === 'cantidad' ? Number(item.cantidad) || 0
        : field === 'precio_unitario' ? (item.precio_unitario === '' ? 0 : Number(item.precio_unitario) || 0)
        : field === 'x_pagar' ? (item.x_pagar === '' ? 0 : Number(item.x_pagar) || 0)
        : (item as unknown as Record<string, unknown>)[field] || ''
    }
    const base = buildItemFieldsBase(itemsServerRef.current[rowId], groupFields)
    const mutationId = crypto.randomUUID()
    rememberOwnItemMutationId(mutationId)
    try {
      const updatedItem = await trackMutation(enqueueRowMutation(rowId, () => patchQuotationItem(rowId, patch, { base: base ?? undefined, mutationId })))
      if (updatedItem) {
        upsertLocalItemState(updatedItem, { preserveLocalEdits: true })
        for (const field of groupFields) {
          clearItemCellConflict(rowId, field)
          const freshBase = buildItemFieldBase(updatedItem, field)
          if (freshBase) itemCellBaseRef.current[getItemCellKey(rowId, field)] = freshBase
        }
      }
    } catch (saveError: unknown) {
      if (saveError instanceof PatchConflictError) {
        const record = buildAtomicConflictRecord(groupFields, base, patch, saveError)
        setItemCellConflicts((prev) => {
          const next = { ...prev }
          for (const field of groupFields) next[getItemCellKey(rowId, field)] = record
          return next
        })
        return
      }
      setError(saveError instanceof Error ? saveError.message : 'Error aplicando cambios')
      void resyncPartidas()
    }
  }, [clearItemCellConflict, enqueueRowMutation, getItemIndexByRowId, getValues, patchQuotationItem, rememberOwnItemMutationId, resyncPartidas, trackMutation, upsertLocalItemState])

  // Presencia estilo Sheets: saber que alguien más está en una celda sirve para
  // resaltarla y avisar, nunca para deshabilitar nada.
  const isItemCellLocked = useCallback((rowId: string, field: QuotationItemCellField) => !!itemCellEditors[getItemCellKey(rowId, field)], [itemCellEditors])

  const getItemRowStatusText = useCallback((rowId: string) => {
    const cellEditor = Object.entries(itemCellEditors).find(([key]) => key.startsWith(`${rowId}:`))?.[1]
    if (cellEditor) return `${getShortName(cellEditor.name, cellEditor.email)} está editando una celda de esta fila`
    return null
  }, [itemCellEditors])

  // Conflicto por celda: alguien más guardó este campo entre que se capturó el
  // "base" y que se intentó guardar. `attempted` es lo que el usuario tecleó,
  // nunca se pierde -- el banner deja elegir entre eso y lo que hay ahora.
  // `responsable_id` es la única celda de UI para el par responsable_id/
  // responsable_nombre (ver handleResponsableChange) -- si el conflicto real
  // cayó solo en `responsable_nombre` (id igual, cambió el nombre
  // denormalizado del proveedor), se muestra igual desde aquí en vez de
  // quedar invisible.
  const getItemCellConflict = useCallback((rowId: string, field: QuotationItemCellField) => {
    const record = itemCellConflicts[getItemCellKey(rowId, field)]
    if (!record) return null
    const detail = field === 'responsable_id' ? (record.responsable_id ?? record.responsable_nombre) : record[field]
    return detail ? { current: detail.current, attempted: detail.attempted } : null
  }, [itemCellConflicts])

  const resolveItemCellConflict = useCallback((rowId: string, field: QuotationItemCellField, resolution: 'theirs' | 'mine') => {
    const key = getItemCellKey(rowId, field)
    const record = itemCellConflicts[key]
    if (!record) return

    if (field === 'responsable_id') {
      // Grupo atómico: `responsable_id` y `responsable_nombre` se resuelven
      // juntos. La RPC es atómica -- si CUALQUIERA de los dos chocó, NINGUNO
      // se guardó -- así que un campo ausente de `record` no significa "se
      // guardó tal cual se intentó": significa que el servidor sigue
      // teniendo el `base` original, capturado antes del intento. Sin este
      // fallback, "Usar" dejaba el <select> mostrando el id que se INTENTÓ
      // (nunca aceptado por el servidor) para el campo que no apareció como
      // conflictivo.
      const detailId = record.responsable_id
      const detailNombre = record.responsable_nombre
      if (!detailId && !detailNombre) return
      const originalBase = itemCellBaseRef.current[key] as { responsable_id?: string; responsable_nombre?: string | null } | undefined
      const trueId = (detailId ? detailId.current : originalBase?.responsable_id) as string | null | undefined
      const trueNombre = (detailNombre ? detailNombre.current : originalBase?.responsable_nombre) as string | null | undefined

      clearItemCellConflict(rowId, field)
      itemsServerRef.current[rowId] = { ...(itemsServerRef.current[rowId] || ({} as ItemCotizacion)), responsable_id: (trueId ?? null) as never, responsable_nombre: (trueNombre ?? null) as never }
      itemCellBaseRef.current[key] = { responsable_id: trueId ?? null, responsable_nombre: trueNombre ?? null }

      if (resolution === 'theirs') {
        const index = getItemIndexByRowId(rowId)
        if (index >= 0) {
          setValue(`items.${index}.responsable_id` as never, (trueId ?? '') as never)
          setValue(`items.${index}.responsable_nombre` as never, (trueNombre ?? '') as never)
        }
        itemDirtyCellsRef.current.delete(key)
        scheduleItemCellIdleRelease(rowId, field)
        return
      }
      // "mine": lo elegido en el form se conserva tal cual, se reintenta con
      // el base ya corregido -- reusa el drenado genérico de partidas, cuyo
      // patch para 'responsable_id' ya manda ambos campos juntos (ver
      // sendItemCellPatchRound).
      void persistItemCellAutosave(rowId, field)
      return
    }

    const groupFields = Object.keys(record) as QuotationItemCellField[]
    if (groupFields.length === 0) return

    if (groupFields.length === 1) {
      // Camino de siempre: un solo campo, sin atomicidad multi-campo de por medio.
      const detail = record[field]
      if (!detail) return
      clearItemCellConflict(rowId, field)
      // El "current" que devolvió la RPC es la verdad del servidor a partir de ahora,
      // gane el valor ajeno o el propio -- ambos casos parten de ahí para el próximo PATCH.
      itemsServerRef.current[rowId] = { ...(itemsServerRef.current[rowId] || ({} as ItemCotizacion)), [field]: detail.current }
      itemCellBaseRef.current[key] = { [field]: detail.current }

      if (resolution === 'theirs') {
        const index = getItemIndexByRowId(rowId)
        if (index >= 0) setValue(`items.${index}.${field}` as never, detail.current as never)
        itemDirtyCellsRef.current.delete(key)
        scheduleItemCellIdleRelease(rowId, field)
        return
      }

      // "mine": lo tecleado se conserva tal cual, se reintenta con el base ya corregido.
      void persistItemCellAutosave(rowId, field)
      return
    }

    // Grupo atómico multi-campo (autofill de producto: descripcion/categoria/
    // precio_unitario/x_pagar viajan juntos en un solo PATCH -- si CUALQUIERA
    // chocó, la RPC rechazó TODO). `record` ya trae el registro completo de
    // los 4 campos (buildAtomicConflictRecord sintetiza los que no aparecían
    // en `saveError.fields`), así que se resuelven TODOS juntos aquí, sin
    // importar en qué celda se haya clickeado el botón -- nunca solo el campo
    // cuyo botón se pulsó, que es justo el bug reportado (los otros 3
    // quedaban mostrando un valor que nunca se guardó).
    const index = getItemIndexByRowId(rowId)
    const nextServer = { ...(itemsServerRef.current[rowId] || ({} as ItemCotizacion)) }
    for (const f of groupFields) {
      const fKey = getItemCellKey(rowId, f)
      const detail = record[f]
      clearItemCellConflict(rowId, f)
      // `itemsServerRef`/`base` se refrescan al valor real SIEMPRE, gane
      // "Usar" o "Mantener" -- `retryItemGroupPatch` arma su propia `base`
      // leyendo `itemsServerRef.current[rowId]` (buildItemFieldsBase), así
      // que si esto solo corriera en la rama "theirs", el reintento de
      // "mine" mandaría la base VIEJA y volvería a chocar contra el mismo
      // conflicto que se acaba de resolver.
      nextServer[f] = detail.current as never
      itemCellBaseRef.current[fKey] = { [f]: detail.current }
      if (resolution === 'theirs') {
        if (index >= 0) setValue(`items.${index}.${f}` as never, detail.current as never)
        itemDirtyCellsRef.current.delete(fKey)
      }
      // "mine": lo que hay en el form (lo intentado) no se toca -- solo se
      // refrescó `base`/`itemsServerRef` arriba, para que el reintento de
      // abajo compare contra el servidor de verdad.
    }
    itemsServerRef.current[rowId] = nextServer

    if (resolution === 'theirs') {
      scheduleItemCellIdleRelease(rowId, field)
      return
    }

    // "mine": reintenta el PATCH completo con TODOS los campos del grupo --
    // nunca uno solo (ver retryItemGroupPatch).
    void retryItemGroupPatch(rowId, groupFields)
  }, [clearItemCellConflict, getItemIndexByRowId, itemCellConflicts, persistItemCellAutosave, retryItemGroupPatch, scheduleItemCellIdleRelease, setValue])

  // Mismo contrato que usa la pantalla de nueva cotización; aquí cada operación se
  // persiste contra la API y se difunde a los demás colaboradores.
  const itemsController: QuotationItemsController = useMemo(() => ({
    addRow: () => { void handleAddRow() },
    removeRow: (rowId) => { void handleRemoveRow(rowId) },
    importItems: handleImportItems,
    selectProduct: (rowId, producto) => { void handleSelectProduct(rowId, producto as never) },
    changeResponsable: (rowId, responsableId) => { void handleResponsableChange(rowId, responsableId) },
    cellFocus: handleItemFieldFocus,
    cellBlur: handleItemFieldBlur,
    cellChange: handleItemFieldChange,
    isCellBusy: isItemCellLocked,
    rowStatusText: getItemRowStatusText,
    getCellConflict: getItemCellConflict,
    resolveCellConflict: resolveItemCellConflict,
    importing: importingItems,
  }), [getItemCellConflict, getItemRowStatusText, handleAddRow, handleImportItems, handleItemFieldBlur, handleItemFieldChange, handleItemFieldFocus, handleRemoveRow, handleResponsableChange, handleSelectProduct, importingItems, isItemCellLocked, resolveItemCellConflict])

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
  const aprobar = async () => {
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
  }
  const handlePdfResult = (result: { savedToDrive: boolean; driveWebViewLink?: string; driveError?: string }) => { if (result.savedToDrive) { setSuccess('PDF guardado exitosamente en Drive'); setDriveLink(result.driveWebViewLink ?? null) } else if (result.driveError) { setError(`Error al guardar en Drive: ${result.driveError}`); setDriveLink(null) } else { setError('No se pudo guardar el PDF en Drive'); setDriveLink(null) } setTimeout(() => { setSuccess(null); setError(null); setDriveLink(null) }, 10000) }
  // Fase 8.7 (Bloque 1): "Generar PDF" (EMITIDA/APROBADA, no cambia estado) no
  // llamaba a flushPendingSaves -- el peor caso no es financiero (no crea
  // proyecto/cuentas) pero sí podía descargar un PDF con datos desactualizados
  // si quedaba algo dirty sin confirmar. Mismo guard que Generar/Aprobar.
  const generarPDF = async () => {
    if (!cotizacion || transitionInFlightRef.current) return
    transitionInFlightRef.current = true
    setGenerandoPdf(true); setError(null); setSuccess(null); setDriveLink(null)
    try {
      const flushOk = await flushPendingSaves()
      if (!flushOk) { setError('Hay cambios recientes que no se guardaron correctamente. Revisa antes de generar el PDF.'); return }
      const result = await generateQuotationPdf(cotizacion, undefined, { skipDownload: true })
      handlePdfResult(result)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error al generar PDF') } finally { setGenerandoPdf(false); transitionInFlightRef.current = false }
  }
  const generarCotizacion = async () => {
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
  }
  const crearComplementaria = () => { if (cotizacion) router.push(buildComplementariaUrl(id, cotizacion)) }
  const cancelarCotizacion = async () => { if (!confirm('¿Cancelar esta cotización? Se eliminará el proyecto y las cuentas por cobrar/pagar asociadas.')) return; setCancelando(true); setError(null); setSuccess(null); try { const res = await fetch(`/api/cotizaciones/${id}/cancelar`, { method: 'POST' }); if (!res.ok) { const body = await res.json(); throw new Error(body.error || 'Error al cancelar') } const updated = await res.json(); applyCotizacionToState(updated); setSuccess('Cotización cancelada. Proyecto y cuentas eliminados.'); setTimeout(() => setSuccess(null), 4000) } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error al cancelar') } finally { setCancelando(false) } }

  if (loading) return <SkeletonQuotationDetail />
  if (!cotizacion) return <div className="p-8 text-center text-faint">Cotización no encontrada</div>

  const currentUserId = (session?.user as { id?: string | null } | undefined)?.id || session?.user?.email || null
  const uniqueOnlineUsers = onlineUsers.filter((user, index, arr) => arr.findIndex((item) => item.user_id === user.user_id) === index)
  const visibleOnlineUsers = uniqueOnlineUsers.filter((user) => user.user_id !== currentUserId)
  // Modelo Google Sheets: la presencia ajena resalta la sección y dice quién edita,
  // pero nunca deja un campo en solo lectura ni detiene el autoguardado.

  const SectionEditBadge = ({ section }: { section: QuotationPresenceSection }) => { const editor = sectionEditors[section]; if (!editor) return null; return <p className="text-xs text-accent-quiet mb-2">{getShortName(editor.name, editor.email)} está editando esta sección</p> }

  return (
    <div className="flex flex-col gap-[19px]">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <Button href="/cotizaciones" variant="ghost" size="md" iconLeft="arrow-left">
            Cotizaciones
          </Button>
          <h1 className="sn-display flex-none text-2xl text-ink md:text-h2">{cotizacion.id}</h1>
          <span className="flex-none whitespace-nowrap text-content text-subtext">Cotizada el {formatDateDisplay(cotizacion.fecha_cotizacion)}</span>
          <StatusBadge tone={toneForCotizacionEstado(cotizacion.estado)}>{cotizacion.estado}</StatusBadge>
          {cotizacion.es_complementaria_de && (
            <span className="flex-none whitespace-nowrap text-content text-accent">
              Complementaria de <span className="font-mono font-bold">{cotizacion.es_complementaria_de}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          {visibleOnlineUsers.length > 0 && (
            <div className="flex flex-none items-center gap-2 rounded-pill border border-hairline bg-row py-1 pl-1 pr-3">
              <div className="flex -space-x-2">
                {visibleOnlineUsers.slice(0, 3).map((user) => {
                  const shortName = getShortName(user.name, user.email)
                  return <span key={user.user_id} title={shortName} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-row bg-accent text-[10px] font-semibold text-accent-ink">{getInitials(shortName)}</span>
                })}
              </div>
              <span className="whitespace-nowrap text-xs text-subtext">{visibleOnlineUsers.length} viendo</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {cotizacion.estado === 'BORRADOR' && <><button onClick={generarCotizacion} disabled={guardando || generandoPdf} className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-3 rounded-control text-content font-semibold transition-colors disabled:opacity-50 min-h-[44px]">{generandoPdf ? 'Guardando en Drive...' : guardando ? 'Generando...' : 'Generar Cotización'}</button></>}
            {cotizacion.estado === 'EMITIDA' && <><button onClick={generarPDF} disabled={generandoPdf} className="border border-hairline bg-input hover:bg-row-alt text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{generandoPdf ? 'Guardando en Drive...' : 'Generar PDF'}</button><button onClick={cancelarCotizacion} disabled={cancelando} className="text-subtext hover:bg-[var(--hover-overlay)] hover:text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{cancelando ? 'Cancelando...' : 'Cancelar'}</button><button onClick={aprobar} disabled={aprobando || guardando} className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-3 rounded-control text-content font-semibold transition-colors disabled:opacity-50 min-h-[44px]">{aprobando ? 'Aprobando...' : 'Aprobar Cotización'}</button></>}
            {cotizacion.estado === 'APROBADA' && <><button onClick={generarPDF} disabled={generandoPdf} className="border border-hairline bg-input hover:bg-row-alt text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{generandoPdf ? 'Guardando en Drive...' : 'Generar PDF'}</button><button onClick={cancelarCotizacion} disabled={cancelando} className="text-subtext hover:bg-[var(--hover-overlay)] hover:text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{cancelando ? 'Cancelando...' : 'Cancelar'}</button><button onClick={crearComplementaria} className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-3 rounded-control text-content font-semibold transition-colors min-h-[44px]">Crear Complementaria</button></>}
          </div>
        </div>
      </div>

      <div>
        <p className="text-subtext">{cotizacion.proyecto} — {cotizacion.cliente}</p>
        <div className="mt-3">
          <p className="sn-label mb-2">Colaborando ahora</p>
          <div className="flex flex-wrap gap-2">
            {visibleOnlineUsers.length === 0 ? <span className="text-xs text-faint">Solo tú en esta cotización</span> : visibleOnlineUsers.map((user) => { const shortName = getShortName(user.name, user.email); return <span key={user.user_id} className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-row px-2.5 py-1 text-xs text-body"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-row-alt text-[10px] font-semibold text-body">{getInitials(shortName)}</span><span>{shortName}</span>{user.active_section ? <span className="text-faint">· {sectionLabels[user.active_section]}</span> : null}</span> })}
          </div>
        </div>
      </div>

      {error && <div className="rounded-control border border-cancelled-fg/30 bg-cancelled-bg text-cancelled-fg px-4 py-3">{error}</div>}
      {success && <div className="rounded-control border border-approved-fg/30 bg-approved-bg text-approved-fg px-4 py-3 flex items-center justify-between gap-4"><span>{success}</span>{driveLink && <a href={driveLink} target="_blank" rel="noopener noreferrer" className="underline text-content whitespace-nowrap hover:opacity-80">Ver en Drive →</a>}</div>}

      {!esEditable && (
        <div className="flex items-center gap-2.5 rounded-control border border-hairline bg-row px-4 py-3 text-content text-subtext">
          <Icon name="lock" size={14} className="flex-none text-faint" />
          Los datos generales y las partidas sólo se editan en Borrador o Emitida.
        </div>
      )}

      {(notasInternas || esEditable) && <div ref={notasSectionRef} className={`bg-row/60 border rounded-panel p-4 ${sectionEditors.notas ? 'border-accent-quiet/70' : 'border-hairline'}`} onFocusCapture={handleNotasFocus} onBlurCapture={handleNotasBlur}><SectionEditBadge section="notas" /><p className="sn-label mb-2">Notas del evento (uso interno)</p>{esEditable ? <textarea value={notasInternas} onChange={e => trackedHandleNotasChange(e.target.value)} rows={3} placeholder="Sin notas..." className="w-full bg-transparent text-body text-content resize-none outline-none placeholder-faint disabled:opacity-50 disabled:cursor-not-allowed" /> : <p className="text-subtext text-content whitespace-pre-wrap">{notasInternas || '—'}</p>}</div>}

      <div ref={generalSectionRef} className={`rounded-panel ${sectionEditors.general ? 'ring-1 ring-accent-quiet/70' : ''}`} onFocusCapture={handleGeneralFocus} onBlurCapture={handleGeneralBlur}>
        <div className="px-1"><SectionEditBadge section="general" /></div>
        <QuotationGeneralInfoSection register={register} setValue={setValue} clienteInput={clienteInput} proyectoInput={proyectoInput} clienteSugerencias={clienteSugerencias} mostrarClienteDropdown={mostrarClienteDropdown} setMostrarClienteDropdown={setMostrarClienteDropdown} proyectosDelCliente={proyectosDelCliente} mostrarProyectoDropdown={mostrarProyectoDropdown} setMostrarProyectoDropdown={setMostrarProyectoDropdown} listaClientes={listaClientes} handleClienteChange={trackedHandleClienteChange} handleProyectoChange={trackedHandleProyectoChange} seleccionarCliente={seleccionarCliente} setProyectoInput={setProyectoInput} onClienteSelected={trackedSelectCliente} onProyectoSelected={trackedSelectProyecto} onFechaEntregaChange={trackedHandleFechaEntregaChange} onLocacionChange={trackedHandleLocacionChange} isReadOnly={!esEditable} readOnlyDisplay={esEditable ? 'input' : 'text'} dateLabel={formatDateDisplay(cotizacion.fecha_cotizacion)} fechaEntregaValue={watch('fecha_entrega')} locacionValue={watch('locacion')} conflicts={generalFieldConflicts} onResolveConflict={resolveGeneralFieldConflict} />
      </div>

      <div ref={partidasSectionRef} className={`rounded-panel ${sectionEditors.partidas ? 'ring-1 ring-accent-quiet/70 ring-offset-0' : ''}`} onFocusCapture={() => esEditable && setActiveSection('partidas')} onBlurCapture={handlePartidasBlur}>
        <div className="px-1"><SectionEditBadge section="partidas" /></div>
        <QuotationItemsSection editable={!!esEditable} register={register} watchedItems={watchedItems} fields={fields} editingItemRowId={editingItemRowId} setEditingItemRowId={setEditingItemRowId} calcItem={calcItem} handleDescripcionChange={handleDescripcionChange} productoSugerencias={productoSugerencias} mostrarProductoDropdown={mostrarProductoDropdown} setMostrarProductoDropdown={setMostrarProductoDropdown} responsables={responsables} readOnlyItems={cotizacion.items || []} onCopyClick={() => setShowCopyModal(true)} items={itemsController} />      </div>

      <QuotationCopyItemsModal open={showCopyModal} onClose={() => setShowCopyModal(false)} excludeCotizacionId={id} onImport={handleImportItems} />

      <div ref={totalsSectionRef} className={`rounded-panel ${sectionEditors.totales ? 'ring-1 ring-accent-quiet/70' : ''}`} onFocusCapture={handleTotalsFocus} onBlurCapture={handleTotalsBlur}>
        <div className="px-1"><SectionEditBadge section="totales" /></div>
        <QuotationTotalsPanels totals={displayTotales} editable={!!esEditable} porcentaje_fee={porcentaje_fee} setPorcentajeFee={trackedSetPorcentajeFee} iva_activo={iva_activo} setIvaActivo={trackedSetIvaActivo} descuento_tipo={descuento_tipo} setDescuentoTipo={trackedSetDescuentoTipo} descuento_valor={descuento_valor} setDescuentoValor={trackedSetDescuentoValor} estimatedTaxes={estimatedTaxes} conflicts={totalsFieldConflicts} onResolveConflict={resolveTotalsFieldConflict} />
      </div>
    </div>
  )
}
