'use client'

import { FocusEvent, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { StatusBadge, toneForCotizacionEstado } from '@/components/ui/StatusBadge'
import { Cotizacion, ItemCotizacion, Proveedor } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { QuotationItemCellField, QuotationPresenceSection, useQuotationPresence } from '@/hooks/useQuotationPresence'
import { ImportableItem, QuotationItemsController, TEMP_ROW_PREFIX } from '@/hooks/useQuotationItems'
import { calculateEstimatedTaxes, calculateQuotationTotals } from '@/lib/quotations/calculations'
import { buildReadOnlyTotals, EMPTY_QUOTATION_ITEM, isBlankQuotationItem, reconcileServerItems } from '@/lib/quotations/mappers'
import { QuotationFormValues } from '@/lib/quotations/types'
import { approveQuotation, buildComplementariaUrl, fetchQuotationDetail, fetchProveedores, generateQuotationPdf, saveQuotationGeneral, saveQuotationNotes, saveQuotationTotals, updateQuotation } from '@/lib/services/quotation-service'
import { formatDateDisplay } from '@/lib/format-date'
import { Icon } from '@/components/ui/Icon'
import { QuotationGeneralInfoSection } from '@/components/quotations/QuotationGeneralInfoSection'
import { QuotationItemsSection } from '@/components/quotations/QuotationItemsSection'
import { QuotationTotalsPanels } from '@/components/quotations/QuotationTotalsPanels'
import { QuotationCopyItemsModal } from '@/components/quotations/QuotationCopyItemsModal'
import { SkeletonQuotationDetail } from '@/app/components/ui/SkeletonQuotationDetail'

const sectionLabels: Record<QuotationPresenceSection, string> = {
  notas: 'Notas',
  general: 'General',
  partidas: 'Partidas',
  totales: 'Totales',
}

const NOTAS_AUTOSAVE_DELAY_MS = 800
const GENERAL_AUTOSAVE_DELAY_MS = 800
const TOTALS_AUTOSAVE_DELAY_MS = 800
const ITEM_CELL_AUTOSAVE_DELAY_MS = 800
const ITEM_CELL_IDLE_RELEASE_MS = 5000
// Cada cuánto se relee la cotización mientras la pantalla está abierta y visible.
// Es la red que hace que un aviso perdido deje de importar: aunque no llegue
// ninguno, las dos pantallas convergen dentro de este plazo.
const RECONCILIACION_MS = 5000
const SECTION_IDLE_RELEASE_MS = 5000

interface GeneralSnapshot {
  cliente: string
  proyecto: string
  fecha_entrega: string
  locacion: string
}

interface TotalsSnapshot {
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: 'monto' | 'porcentaje'
  descuento_valor: number
}

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

function buildGeneralSnapshot(values: Partial<GeneralSnapshot>): GeneralSnapshot {
  return {
    cliente: values.cliente || '',
    proyecto: values.proyecto || '',
    fecha_entrega: values.fecha_entrega || '',
    locacion: values.locacion || '',
  }
}

function areGeneralSnapshotsEqual(a: GeneralSnapshot, b: GeneralSnapshot) {
  return a.cliente === b.cliente && a.proyecto === b.proyecto && a.fecha_entrega === b.fecha_entrega && a.locacion === b.locacion
}

function buildTotalsSnapshot(values: Partial<TotalsSnapshot>): TotalsSnapshot {
  return {
    porcentaje_fee: typeof values.porcentaje_fee === 'number' ? values.porcentaje_fee : 0.15,
    iva_activo: typeof values.iva_activo === 'boolean' ? values.iva_activo : true,
    descuento_tipo: values.descuento_tipo === 'porcentaje' ? 'porcentaje' : 'monto',
    descuento_valor: typeof values.descuento_valor === 'number' ? values.descuento_valor : 0,
  }
}

function areTotalsSnapshotsEqual(a: TotalsSnapshot, b: TotalsSnapshot) {
  return a.porcentaje_fee === b.porcentaje_fee && a.iva_activo === b.iva_activo && a.descuento_tipo === b.descuento_tipo && a.descuento_valor === b.descuento_valor
}

function getItemCellKey(rowId: string, field: QuotationItemCellField) {
  return `${rowId}:${field}`
}

function mapItemToFormItem(item: ItemCotizacion): QuotationFormValues['items'][number] {
  return {
    id: item.id,
    categoria: item.categoria || '',
    descripcion: item.descripcion || '',
    cantidad: item.cantidad || 1,
    precio_unitario: item.precio_unitario || 0,
    responsable_id: item.responsable_id || '',
    responsable_nombre: item.responsable_nombre || '',
    x_pagar: item.x_pagar || 0,
  }
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
  const [notasInternas, setNotasInternas] = useState('')
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [porcentaje_fee, setPorcentajeFee] = useState(0.15)
  const [iva_activo, setIvaActivo] = useState(true)
  const [descuento_tipo, setDescuentoTipo] = useState<'monto' | 'porcentaje'>('monto')
  const [descuento_valor, setDescuentoValor] = useState(0)
  const [isSavingNotas, setIsSavingNotas] = useState(false)
  const [isSavingGeneral, setIsSavingGeneral] = useState(false)
  const [isSavingTotals, setIsSavingTotals] = useState(false)
  const [importingItems, setImportingItems] = useState(false)
  const notasSectionRef = useRef<HTMLDivElement | null>(null)
  const generalSectionRef = useRef<HTMLDivElement | null>(null)
  const totalsSectionRef = useRef<HTMLDivElement | null>(null)
  const partidasSectionRef = useRef<HTMLDivElement | null>(null)
  const notasAutosaveTimerRef = useRef<number | null>(null)
  const generalAutosaveTimerRef = useRef<number | null>(null)
  const totalsAutosaveTimerRef = useRef<number | null>(null)
  const notasIdleReleaseTimerRef = useRef<number | null>(null)
  const generalIdleReleaseTimerRef = useRef<number | null>(null)
  const totalsIdleReleaseTimerRef = useRef<number | null>(null)
  const notasDirtyRef = useRef(false)
  const generalDirtyRef = useRef(false)
  const totalsDirtyRef = useRef(false)
  const notasLockHeldRef = useRef(false)
  const generalLockHeldRef = useRef(false)
  const totalsLockHeldRef = useRef(false)
  const notasFocusedRef = useRef(false)
  const generalFocusedRef = useRef(false)
  const totalsFocusedRef = useRef(false)
  const notasValueRef = useRef('')
  const clienteInputValueRef = useRef('')
  const proyectoInputValueRef = useRef('')
  const porcentajeFeeValueRef = useRef(0.15)
  const ivaActivoValueRef = useRef(true)
  const descuentoTipoValueRef = useRef<'monto' | 'porcentaje'>('monto')
  const descuentoValorValueRef = useRef(0)
  const itemDirtyCellsRef = useRef<Set<string>>(new Set())
  const itemFocusedCellsRef = useRef<Set<string>>(new Set())
  const itemSavingCellsRef = useRef<Set<string>>(new Set())
  const itemCellAutosaveTimersRef = useRef<Record<string, number | null>>({})
  const itemCellIdleReleaseTimersRef = useRef<Record<string, number | null>>({})
  // Cola por fila: encadena PATCH/DELETE de una misma partida para que no se pisen.
  const rowMutationQueueRef = useRef<Map<string, Promise<unknown>>>(new Map())
  // Filas ya quitadas en pantalla cuyo DELETE sigue en vuelo. `useFieldArray.remove`
  // trabaja sobre el snapshot del último render, así que dos borrados seguidos (antes
  // de que React repinte) dejaban una fila fantasma. Con este conjunto la lista se
  // recalcula entera y `replace` la aplica de golpe, sin depender de índices.
  const pendingRowRemovalsRef = useRef<Set<string>>(new Set())
  // id provisional -> promesa con el id real que devuelva el POST
  const pendingRowIdsRef = useRef<Map<string, Promise<string>>>(new Map())
  // Instante de la última escritura local por celda. Cualquier dato del servidor
  // pedido ANTES de esa marca llega viejo y no debe aplicarse a esa celda.
  const localWriteAtRef = useRef<Map<string, number>>(new Map())
  const persistItemCellAutosaveRef = useRef<((rowId: string, field: QuotationItemCellField) => Promise<void>) | null>(null)
  /**
   * Al llegar el id definitivo de una fila recién creada hay que mudar TODAS las
   * marcas que quedaron registradas con el id provisional. Sin esto, lo tecleado
   * antes de que respondiera el alta se perdía: el autoguardado buscaba la fila por
   * el id provisional, ya inexistente, y salía sin guardar.
   */
  const migrateRowKeys = useCallback((fromRowId: string, toRowId: string) => {
    const rename = (set: Set<string>) => {
      for (const key of Array.from(set)) {
        if (!key.startsWith(`${fromRowId}:`)) continue
        set.delete(key)
        set.add(`${toRowId}:${key.slice(fromRowId.length + 1)}`)
      }
    }
    rename(itemDirtyCellsRef.current)
    rename(itemFocusedCellsRef.current)
    rename(itemSavingCellsRef.current)

    for (const [key, at] of Array.from(localWriteAtRef.current.entries())) {
      if (!key.startsWith(`${fromRowId}:`)) continue
      localWriteAtRef.current.delete(key)
      localWriteAtRef.current.set(`${toRowId}:${key.slice(fromRowId.length + 1)}`, at)
    }

    // Los autoguardados pendientes se reprograman contra el id definitivo.
    for (const [key, timer] of Object.entries(itemCellAutosaveTimersRef.current)) {
      if (!key.startsWith(`${fromRowId}:`)) continue
      if (timer) window.clearTimeout(timer)
      delete itemCellAutosaveTimersRef.current[key]
      const field = key.slice(fromRowId.length + 1) as QuotationItemCellField
      const nuevaClave = getItemCellKey(toRowId, field)
      itemCellAutosaveTimersRef.current[nuevaClave] = window.setTimeout(() => {
        void persistItemCellAutosaveRef.current?.(toRowId, field)
      }, ITEM_CELL_AUTOSAVE_DELAY_MS)
    }
    for (const [key, timer] of Object.entries(itemCellIdleReleaseTimersRef.current)) {
      if (!key.startsWith(`${fromRowId}:`)) continue
      if (timer) window.clearTimeout(timer)
      delete itemCellIdleReleaseTimersRef.current[key]
    }
  }, [])

  const markLocalWrite = useCallback((rowId: string, field: QuotationItemCellField) => {
    localWriteAtRef.current.set(getItemCellKey(rowId, field), Date.now())
  }, [])
  const lastSavedNotasRef = useRef('')
  const lastSavedGeneralRef = useRef<GeneralSnapshot>(buildGeneralSnapshot({}))
  const lastSavedTotalsRef = useRef<TotalsSnapshot>(buildTotalsSnapshot({}))

  const { register, control, watch, reset, setValue, getValues } = useForm<QuotationFormValues>({
    defaultValues: { cliente: '', proyecto: '', fecha_entrega: '', locacion: '', items: [{ ...EMPTY_QUOTATION_ITEM }] },
  })
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')
  const watchedFechaEntrega = watch('fecha_entrega') || ''
  const watchedLocacion = watch('locacion') || ''
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

  const currentGeneralSnapshot = useMemo(() => buildGeneralSnapshot({ cliente: clienteInput, proyecto: proyectoInput, fecha_entrega: watchedFechaEntrega, locacion: watchedLocacion }), [clienteInput, proyectoInput, watchedFechaEntrega, watchedLocacion])
  const currentTotalsSnapshot = useMemo(() => buildTotalsSnapshot({ porcentaje_fee, iva_activo, descuento_tipo, descuento_valor }), [descuento_tipo, descuento_valor, iva_activo, porcentaje_fee])

  const esEditable = cotizacion?.estado === 'BORRADOR' || cotizacion?.estado === 'EMITIDA'
  const {
    onlineUsers,
    sectionEditors,
    itemCellEditors,
    itemRowEditors,
    latestItemMutation,
    savedSections,
    setActiveSection,
    releaseSection,
    lockItemCell,
    releaseItemCell,
    broadcastItemMutation,
    markSectionSaved,
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

  const getCurrentNotasSnapshot = useCallback(() => notasValueRef.current.trim() ? notasValueRef.current : '', [])
  const getCurrentGeneralSnapshot = useCallback(() => buildGeneralSnapshot({ cliente: clienteInputValueRef.current, proyecto: proyectoInputValueRef.current, fecha_entrega: getValues('fecha_entrega') || '', locacion: getValues('locacion') || '' }), [getValues])
  const getCurrentTotalsSnapshot = useCallback(() => buildTotalsSnapshot({ porcentaje_fee: porcentajeFeeValueRef.current, iva_activo: ivaActivoValueRef.current, descuento_tipo: descuentoTipoValueRef.current, descuento_valor: descuentoValorValueRef.current }), [])
  const getItemIndexByRowId = useCallback((rowId: string) => { const items = getValues('items') || []; return items.findIndex((item) => item?.id === rowId) }, [getValues])
  const hasLocalItemRowActivity = useCallback((rowId: string) => (
    Array.from(itemDirtyCellsRef.current).some((key) => key.startsWith(`${rowId}:`)) || Array.from(itemFocusedCellsRef.current).some((key) => key.startsWith(`${rowId}:`)) || Array.from(itemSavingCellsRef.current).some((key) => key.startsWith(`${rowId}:`))
  ), [])

  const clearNotasIdleReleaseTimer = useCallback(() => { if (notasIdleReleaseTimerRef.current !== null) { window.clearTimeout(notasIdleReleaseTimerRef.current); notasIdleReleaseTimerRef.current = null } }, [])
  const clearGeneralIdleReleaseTimer = useCallback(() => { if (generalIdleReleaseTimerRef.current !== null) { window.clearTimeout(generalIdleReleaseTimerRef.current); generalIdleReleaseTimerRef.current = null } }, [])
  const clearTotalsIdleReleaseTimer = useCallback(() => { if (totalsIdleReleaseTimerRef.current !== null) { window.clearTimeout(totalsIdleReleaseTimerRef.current); totalsIdleReleaseTimerRef.current = null } }, [])
  const clearItemCellAutosaveTimer = useCallback((key: string) => { const timer = itemCellAutosaveTimersRef.current[key]; if (timer !== null && timer !== undefined) { window.clearTimeout(timer); delete itemCellAutosaveTimersRef.current[key] } }, [])
  const clearItemCellIdleReleaseTimer = useCallback((key: string) => { const timer = itemCellIdleReleaseTimersRef.current[key]; if (timer !== null && timer !== undefined) { window.clearTimeout(timer); delete itemCellIdleReleaseTimersRef.current[key] } }, [])

  const scheduleNotasIdleRelease = useCallback(() => { clearNotasIdleReleaseTimer(); if (!notasLockHeldRef.current) return; notasIdleReleaseTimerRef.current = window.setTimeout(() => { notasIdleReleaseTimerRef.current = null; if (!notasLockHeldRef.current || notasDirtyRef.current || isSavingNotas) return; notasLockHeldRef.current = false; releaseSection('notas') }, SECTION_IDLE_RELEASE_MS) }, [clearNotasIdleReleaseTimer, isSavingNotas, releaseSection])
  const scheduleGeneralIdleRelease = useCallback(() => { clearGeneralIdleReleaseTimer(); if (!generalLockHeldRef.current) return; generalIdleReleaseTimerRef.current = window.setTimeout(() => { generalIdleReleaseTimerRef.current = null; if (!generalLockHeldRef.current || generalDirtyRef.current || isSavingGeneral) return; generalLockHeldRef.current = false; releaseSection('general') }, SECTION_IDLE_RELEASE_MS) }, [clearGeneralIdleReleaseTimer, isSavingGeneral, releaseSection])
  const scheduleTotalsIdleRelease = useCallback(() => { clearTotalsIdleReleaseTimer(); if (!totalsLockHeldRef.current) return; totalsIdleReleaseTimerRef.current = window.setTimeout(() => { totalsIdleReleaseTimerRef.current = null; if (!totalsLockHeldRef.current || totalsDirtyRef.current || isSavingTotals) return; totalsLockHeldRef.current = false; releaseSection('totales') }, SECTION_IDLE_RELEASE_MS) }, [clearTotalsIdleReleaseTimer, isSavingTotals, releaseSection])
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

  // Traduce un id provisional al real, esperando al POST si sigue en vuelo.
  const resolveRowId = useCallback(async (rowId: string): Promise<string> => {
    if (!rowId.startsWith(TEMP_ROW_PREFIX)) return rowId
    const pending = pendingRowIdsRef.current.get(rowId)
    if (!pending) throw new Error('La partida aún no se ha creado')
    return pending
  }, [])

  const patchQuotationItem = useCallback(async (tempOrRealId: string, patch: Record<string, unknown>) => {
    const rowId = await resolveRowId(tempOrRealId)
    const response = await fetch(`/api/cotizaciones/${id}/items/${rowId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || 'Error actualizando partida')
    return data?.item as ItemCotizacion | undefined
  }, [id, resolveRowId])

  const createQuotationItemRow = useCallback(async () => {
    const response = await fetch(`/api/cotizaciones/${id}/items`, { method: 'POST' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || 'Error creando partida')
    return data?.item as ItemCotizacion | undefined
  }, [id])

  const deleteQuotationItemRow = useCallback(async (tempOrRealId: string) => {
    const rowId = await resolveRowId(tempOrRealId)
    const response = await fetch(`/api/cotizaciones/${id}/items/${rowId}`, { method: 'DELETE' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || 'Error eliminando partida')
  }, [id, resolveRowId])

  // `preserveLocalEdits` evita que la respuesta del servidor sobreescriba una celda
  // que el usuario sigue editando: si se tecleó durante el debounce + el round-trip,
  // el valor viejo del servidor borraba lo recién escrito.
  const upsertLocalItemState = useCallback((item: ItemCotizacion, options?: { preserveLocalEdits?: boolean; allowInsert?: boolean }) => {
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
  }, [append, getItemIndexByRowId, setValue])

  const removeLocalItemState = useCallback((rowId: string) => {
    const index = getItemIndexByRowId(rowId)
    if (index >= 0) remove(index)

    setCotizacion((prev) => prev ? { ...prev, items: (prev.items || []).filter((item) => item.id !== rowId) } : prev)
  }, [getItemIndexByRowId, remove])

  const applyCotizacionToState = useCallback((cot: Cotizacion) => {
    setCotizacion(cot)
    const notas = cot.notas_internas ?? ''
    const general = buildGeneralSnapshot({ cliente: cot.cliente, proyecto: cot.proyecto, fecha_entrega: cot.fecha_entrega || '', locacion: cot.locacion || '' })
    const totalsConfig = buildTotalsSnapshot({ porcentaje_fee: cot.porcentaje_fee, iva_activo: cot.iva_activo, descuento_tipo: cot.descuento_tipo, descuento_valor: cot.descuento_valor })
    setNotasInternas(notas)
    notasValueRef.current = notas
    lastSavedNotasRef.current = notas
    notasDirtyRef.current = false
    lastSavedGeneralRef.current = general
    generalDirtyRef.current = false
    lastSavedTotalsRef.current = totalsConfig
    totalsDirtyRef.current = false
    setClienteInput(cot.cliente || '')
    clienteInputValueRef.current = cot.cliente || ''
    setProyectoInput(cot.proyecto || '')
    proyectoInputValueRef.current = cot.proyecto || ''
    setPorcentajeFee(totalsConfig.porcentaje_fee)
    porcentajeFeeValueRef.current = totalsConfig.porcentaje_fee
    setIvaActivo(totalsConfig.iva_activo)
    ivaActivoValueRef.current = totalsConfig.iva_activo
    setDescuentoTipo(totalsConfig.descuento_tipo)
    descuentoTipoValueRef.current = totalsConfig.descuento_tipo
    setDescuentoValor(totalsConfig.descuento_valor)
    descuentoValorValueRef.current = totalsConfig.descuento_valor
    reset({ cliente: cot.cliente, proyecto: cot.proyecto, fecha_entrega: cot.fecha_entrega || '', locacion: cot.locacion || '', items: (cot.items || []).map(mapItemToFormItem) })
  }, [reset, setClienteInput, setProyectoInput])

  const applyNotasOnly = useCallback((notas: string | null) => { const normalized = notas ?? ''; setNotasInternas(normalized); notasValueRef.current = normalized; lastSavedNotasRef.current = normalized; notasDirtyRef.current = false; setCotizacion((prev) => (prev ? { ...prev, notas_internas: notas } : prev)) }, [])
  const applyGeneralOnly = useCallback((cot: Cotizacion) => { const general = buildGeneralSnapshot({ cliente: cot.cliente, proyecto: cot.proyecto, fecha_entrega: cot.fecha_entrega || '', locacion: cot.locacion || '' }); lastSavedGeneralRef.current = general; generalDirtyRef.current = false; setClienteInput(general.cliente); clienteInputValueRef.current = general.cliente; setProyectoInput(general.proyecto); proyectoInputValueRef.current = general.proyecto; setValue('cliente', general.cliente); setValue('proyecto', general.proyecto); setValue('fecha_entrega', general.fecha_entrega); setValue('locacion', general.locacion); setCotizacion((prev) => prev ? { ...prev, cliente: general.cliente, proyecto: general.proyecto, fecha_entrega: general.fecha_entrega || null, locacion: general.locacion || null } : prev) }, [setClienteInput, setProyectoInput, setValue])
  const applyTotalsOnly = useCallback((cot: Cotizacion) => { const totalsConfig = buildTotalsSnapshot({ porcentaje_fee: cot.porcentaje_fee, iva_activo: cot.iva_activo, descuento_tipo: cot.descuento_tipo, descuento_valor: cot.descuento_valor }); lastSavedTotalsRef.current = totalsConfig; totalsDirtyRef.current = false; setPorcentajeFee(totalsConfig.porcentaje_fee); porcentajeFeeValueRef.current = totalsConfig.porcentaje_fee; setIvaActivo(totalsConfig.iva_activo); ivaActivoValueRef.current = totalsConfig.iva_activo; setDescuentoTipo(totalsConfig.descuento_tipo); descuentoTipoValueRef.current = totalsConfig.descuento_tipo; setDescuentoValor(totalsConfig.descuento_valor); descuentoValorValueRef.current = totalsConfig.descuento_valor; setCotizacion((prev) => prev ? { ...prev, porcentaje_fee: totalsConfig.porcentaje_fee, iva_activo: totalsConfig.iva_activo, descuento_tipo: totalsConfig.descuento_tipo, descuento_valor: totalsConfig.descuento_valor } : prev) }, [])

  // Red de seguridad única: ante cualquier fallo del servidor se vuelve a leer la
  // cotización y se reconstruye la tabla, en vez de parchear el estado local a mano
  // (que era lo que dejaba filas fantasma imposibles de borrar).
  const resyncPartidas = useCallback(async () => {
    try {
      const updated = await fetchQuotationDetail(id)
      pendingRowRemovalsRef.current.clear()
      pendingRowIdsRef.current.clear()
      applyCotizacionToState(updated)
    } catch (loadError) {
      console.error('[cotizaciones/[id]] Error resincronizando partidas:', loadError)
    }
  }, [applyCotizacionToState, id])

  /**
   * Reconciliación con el servidor: la ÚNICA garantía de que las dos pantallas
   * terminen viendo lo mismo.
   *
   * Antes, el estado ajeno llegaba solo empujado por el navegador del otro
   * (`item_mutation`): un aviso sin acuse, sin reintento y con el error tragado
   * -los siete envíos del canal terminan en `.catch(() => null)`-. Si ese aviso se
   * perdía, las dos pantallas quedaban distintas hasta recargar y nadie se enteraba.
   * Ahora el aviso es solo una pista para que el cambio se vea al instante; quien
   * garantiza la convergencia es esto, que lee de la base a través de nuestro propio
   * servidor (el que sí valida la sesión).
   *
   * Nada de esto pisa lo que el usuario está escribiendo: las celdas sucias, bajo el
   * cursor o con guardado en vuelo se conservan, y una respuesta que salió antes de
   * una escritura local pierde contra ella.
   */
  const reconciliacionEnCursoRef = useRef<Promise<void> | null>(null)
  const reconciliarConServidor = useCallback(async () => {
    // Varias pistas seguidas, o pista y latido a la vez, no deben abrir lecturas
    // paralelas que luego compitan entre sí al aplicarse.
    if (reconciliacionEnCursoRef.current) return reconciliacionEnCursoRef.current

    const trabajo = (async () => {
      const pedidoEn = Date.now()
      try {
      const updated = await fetchQuotationDetail(id)
      const locales = getValues('items') || []
      const servidor = (updated.items || []).map(mapItemToFormItem)
      const fusionadas = reconcileServerItems(locales, servidor, {
        celdaOcupada: (rowId, campo) => {
          const key = getItemCellKey(rowId, campo as QuotationItemCellField)
          return itemDirtyCellsRef.current.has(key) || itemFocusedCellsRef.current.has(key) || itemSavingCellsRef.current.has(key)
        },
        // Una escritura local posterior a la petición gana: el servidor respondió
        // con una foto anterior y aplicarla borraría lo recién capturado.
        escrituraLocalPosterior: (rowId, campo) => {
          const at = localWriteAtRef.current.get(getItemCellKey(rowId, campo as QuotationItemCellField))
          return at !== undefined && at >= pedidoEn
        },
        // Las filas provisionales y las que se están borrando siguen siendo del usuario.
        conservarLocal: (rowId) => rowId.startsWith(TEMP_ROW_PREFIX) || hasLocalItemRowActivity(rowId),
      })

      const mismasFilas = fusionadas.length === locales.length && fusionadas.every((item, i) => item.id === locales[i]?.id)
      if (mismasFilas) {
        // Mismo conjunto de filas: se actualiza celda a celda para NO remontar los
        // inputs y no robarle el foco a quien está escribiendo.
        fusionadas.forEach((item, index) => {
          const local = locales[index]
          if (item.categoria !== local.categoria) setValue(`items.${index}.categoria`, item.categoria)
          if (item.descripcion !== local.descripcion) setValue(`items.${index}.descripcion`, item.descripcion)
          if (item.cantidad !== local.cantidad) setValue(`items.${index}.cantidad`, item.cantidad)
          if (item.precio_unitario !== local.precio_unitario) setValue(`items.${index}.precio_unitario`, item.precio_unitario)
          if (item.x_pagar !== local.x_pagar) setValue(`items.${index}.x_pagar`, item.x_pagar)
          if (item.responsable_id !== local.responsable_id) {
            setValue(`items.${index}.responsable_id`, item.responsable_id)
            setValue(`items.${index}.responsable_nombre`, item.responsable_nombre)
          }
        })
      } else {
        replace(fusionadas)
      }
      setCotizacion((prev) => prev ? { ...prev, items: updated.items || [], subtotal: updated.subtotal, fee_agencia: updated.fee_agencia, general: updated.general, iva: updated.iva, total: updated.total, margen_total: updated.margen_total, utilidad_total: updated.utilidad_total } : prev)
        // Las tres secciones restantes solo se aplican si el usuario NO las tiene
        // ocupadas: applyGeneralOnly y compañía pisan el valor y además limpian la
        // marca de "sin guardar", así que aplicarlas a ciegas borraba la edición en
        // curso -- el mismo defecto que se arregló en las partidas, otra sección.
        if (!notasLockHeldRef.current && !notasDirtyRef.current) applyNotasOnly(updated.notas_internas ?? null)
        if (!generalLockHeldRef.current && !generalDirtyRef.current) applyGeneralOnly(updated)
        if (!totalsLockHeldRef.current && !totalsDirtyRef.current) applyTotalsOnly(updated)
      } catch (loadError) {
        console.error('[cotizaciones/[id]] Error reconciliando con el servidor:', loadError)
      }
    })()

    reconciliacionEnCursoRef.current = trabajo
    try {
      await trabajo
    } finally {
      reconciliacionEnCursoRef.current = null
    }
  }, [applyGeneralOnly, applyNotasOnly, applyTotalsOnly, getValues, hasLocalItemRowActivity, id, replace, setValue])

  useEffect(() => { refreshCatalogos() }, [refreshCatalogos])
  useEffect(() => { notasValueRef.current = notasInternas }, [notasInternas])
  useEffect(() => { clienteInputValueRef.current = clienteInput }, [clienteInput])
  useEffect(() => { proyectoInputValueRef.current = proyectoInput }, [proyectoInput])
  useEffect(() => { porcentajeFeeValueRef.current = porcentaje_fee }, [porcentaje_fee])
  useEffect(() => { ivaActivoValueRef.current = iva_activo }, [iva_activo])
  useEffect(() => { descuentoTipoValueRef.current = descuento_tipo }, [descuento_tipo])
  useEffect(() => { descuentoValorValueRef.current = descuento_valor }, [descuento_valor])

  useEffect(() => {
    Promise.all([fetchQuotationDetail(id), fetchProveedores()]).then(([cot, resp]) => { applyCotizacionToState(cot); setResponsables(resp); setLoading(false); const pending = sessionStorage.getItem('pdf_drive_result'); if (pending) { sessionStorage.removeItem('pdf_drive_result'); try { const { link } = JSON.parse(pending); setSuccess('PDF guardado exitosamente en Drive'); setDriveLink(link ?? null) } catch {} } }).catch(() => setLoading(false))
  }, [id, applyCotizacionToState])

  // `watch('items')` devuelve los valores con los que se hizo el `append` hasta que el
  // arreglo se vuelve a registrar, así que una fila recién agregada aportaba 0 al
  // subtotal. Combinar `fields` con lo observado es el patrón que recomienda
  // react-hook-form para useFieldArray y deja el total correcto en ambos casos.
  const itemsParaTotales = useMemo(
    () => fields.map((field, index) => ({ ...(field as unknown as QuotationFormValues['items'][number]), ...(watchedItems?.[index] ?? {}) })),
    [fields, watchedItems]
  )
  const totales = useMemo(() => calculateQuotationTotals({ items: itemsParaTotales, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor }), [itemsParaTotales, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor])
  const displayTotales = useMemo(() => esEditable && cotizacion ? totales : (cotizacion ? buildReadOnlyTotals(cotizacion) : totales), [esEditable, cotizacion, totales])
  const estimatedTaxes = useMemo(() => calculateEstimatedTaxes(itemsParaTotales, displayTotales), [itemsParaTotales, displayTotales])

  const persistNotasAutosave = useCallback(async () => {
    if (!cotizacion) return
    const notasToSave = getCurrentNotasSnapshot(); const previousNotas = lastSavedNotasRef.current
    if (notasToSave === previousNotas) { notasDirtyRef.current = false; if (!notasFocusedRef.current) { clearNotasIdleReleaseTimer(); notasLockHeldRef.current = false; releaseSection('notas'); return } scheduleNotasIdleRelease(); return }
    setIsSavingNotas(true)
    try { await saveQuotationNotes(id, notasToSave || null); lastSavedNotasRef.current = notasToSave; setCotizacion((prev) => (prev ? { ...prev, notas_internas: notasToSave || null } : prev)); markSectionSaved('notas') } catch (saveError: unknown) { setError(saveError instanceof Error ? saveError.message : 'Error guardando notas internas'); notasDirtyRef.current = getCurrentNotasSnapshot() !== lastSavedNotasRef.current; clearNotasIdleReleaseTimer(); notasLockHeldRef.current = false; releaseSection('notas'); return } finally { setIsSavingNotas(false) }
    const hasPendingChanges = getCurrentNotasSnapshot() !== lastSavedNotasRef.current; notasDirtyRef.current = hasPendingChanges; if (!notasFocusedRef.current) { clearNotasIdleReleaseTimer(); notasLockHeldRef.current = false; releaseSection('notas'); return } if (!hasPendingChanges) scheduleNotasIdleRelease()
  }, [clearNotasIdleReleaseTimer, cotizacion, getCurrentNotasSnapshot, id, markSectionSaved, releaseSection, scheduleNotasIdleRelease])

  const persistGeneralAutosave = useCallback(async () => {
    if (!cotizacion) return
    const snapshot = getCurrentGeneralSnapshot(); const previousSnapshot = lastSavedGeneralRef.current
    if (areGeneralSnapshotsEqual(snapshot, previousSnapshot)) { generalDirtyRef.current = false; if (!generalFocusedRef.current) { clearGeneralIdleReleaseTimer(); generalLockHeldRef.current = false; releaseSection('general'); return } scheduleGeneralIdleRelease(); return }
    setIsSavingGeneral(true)
    try { await saveQuotationGeneral(id, { cliente: snapshot.cliente, proyecto: snapshot.proyecto, fecha_entrega: snapshot.fecha_entrega || null, locacion: snapshot.locacion || null }); lastSavedGeneralRef.current = snapshot; setCotizacion((prev) => prev ? { ...prev, cliente: snapshot.cliente, proyecto: snapshot.proyecto, fecha_entrega: snapshot.fecha_entrega || null, locacion: snapshot.locacion || null } : prev); markSectionSaved('general') } catch (saveError: unknown) { setError(saveError instanceof Error ? saveError.message : 'Error guardando información general'); generalDirtyRef.current = !areGeneralSnapshotsEqual(getCurrentGeneralSnapshot(), lastSavedGeneralRef.current); clearGeneralIdleReleaseTimer(); generalLockHeldRef.current = false; releaseSection('general'); return } finally { setIsSavingGeneral(false) }
    const hasPendingChanges = !areGeneralSnapshotsEqual(getCurrentGeneralSnapshot(), lastSavedGeneralRef.current); generalDirtyRef.current = hasPendingChanges; if (!generalFocusedRef.current) { clearGeneralIdleReleaseTimer(); generalLockHeldRef.current = false; releaseSection('general'); return } if (!hasPendingChanges) scheduleGeneralIdleRelease()
  }, [clearGeneralIdleReleaseTimer, cotizacion, getCurrentGeneralSnapshot, id, markSectionSaved, releaseSection, scheduleGeneralIdleRelease])

  const persistTotalsAutosave = useCallback(async () => {
    if (!cotizacion) return
    const snapshot = getCurrentTotalsSnapshot(); const previousSnapshot = lastSavedTotalsRef.current
    if (areTotalsSnapshotsEqual(snapshot, previousSnapshot)) { totalsDirtyRef.current = false; if (!totalsFocusedRef.current) { clearTotalsIdleReleaseTimer(); totalsLockHeldRef.current = false; releaseSection('totales'); return } scheduleTotalsIdleRelease(); return }
    setIsSavingTotals(true)
    try { await saveQuotationTotals(id, snapshot); lastSavedTotalsRef.current = snapshot; setCotizacion((prev) => prev ? { ...prev, porcentaje_fee: snapshot.porcentaje_fee, iva_activo: snapshot.iva_activo, descuento_tipo: snapshot.descuento_tipo, descuento_valor: snapshot.descuento_valor } : prev); markSectionSaved('totales') } catch (saveError: unknown) { setError(saveError instanceof Error ? saveError.message : 'Error guardando configuración de totales'); totalsDirtyRef.current = !areTotalsSnapshotsEqual(getCurrentTotalsSnapshot(), lastSavedTotalsRef.current); clearTotalsIdleReleaseTimer(); totalsLockHeldRef.current = false; releaseSection('totales'); return } finally { setIsSavingTotals(false) }
    const hasPendingChanges = !areTotalsSnapshotsEqual(getCurrentTotalsSnapshot(), lastSavedTotalsRef.current); totalsDirtyRef.current = hasPendingChanges; if (!totalsFocusedRef.current) { clearTotalsIdleReleaseTimer(); totalsLockHeldRef.current = false; releaseSection('totales'); return } if (!hasPendingChanges) scheduleTotalsIdleRelease()
  }, [clearTotalsIdleReleaseTimer, cotizacion, getCurrentTotalsSnapshot, id, markSectionSaved, releaseSection, scheduleTotalsIdleRelease])

  const persistItemCellAutosave = useCallback(async (rowId: string, field: QuotationItemCellField) => {
    const key = getItemCellKey(rowId, field)
    const index = getItemIndexByRowId(rowId)
    if (index < 0) return
    const item = getValues(`items.${index}`)
    if (!item) return
    itemSavingCellsRef.current.add(key)
    try {
      const patch: Record<string, unknown> = field === 'categoria' ? { categoria: item.categoria || '' }
        : field === 'descripcion' ? { descripcion: item.descripcion || '' }
        : field === 'cantidad' ? { cantidad: Number(item.cantidad) || 0 }
        : field === 'precio_unitario' ? { precio_unitario: item.precio_unitario === '' ? 0 : Number(item.precio_unitario) || 0 }
        : field === 'x_pagar' ? { x_pagar: item.x_pagar === '' ? 0 : Number(item.x_pagar) || 0 }
        : { responsable_id: item.responsable_id || '', responsable_nombre: item.responsable_nombre || '' }
      const updatedItem = await patchQuotationItem(rowId, patch)
      markLocalWrite(rowId, field)
      itemDirtyCellsRef.current.delete(key)
      if (updatedItem) {
        upsertLocalItemState(updatedItem, { preserveLocalEdits: true })
        broadcastItemMutation({ action: 'upsert', row_id: rowId, item: updatedItem })
      }
      markSectionSaved('partidas')
      scheduleItemCellIdleRelease(rowId, field)
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Error guardando partida')
    } finally {
      itemSavingCellsRef.current.delete(key)
    }
  }, [broadcastItemMutation, getItemIndexByRowId, getValues, markLocalWrite, markSectionSaved, patchQuotationItem, scheduleItemCellIdleRelease, upsertLocalItemState])
  persistItemCellAutosaveRef.current = persistItemCellAutosave

  useEffect(() => {
    if (!esEditable || !notasLockHeldRef.current || !notasDirtyRef.current || isSavingNotas) return
    if (notasAutosaveTimerRef.current !== null) window.clearTimeout(notasAutosaveTimerRef.current)
    notasAutosaveTimerRef.current = window.setTimeout(() => { void persistNotasAutosave() }, NOTAS_AUTOSAVE_DELAY_MS)
    return () => { if (notasAutosaveTimerRef.current !== null) { window.clearTimeout(notasAutosaveTimerRef.current); notasAutosaveTimerRef.current = null } }
  }, [esEditable, isSavingNotas, notasInternas, persistNotasAutosave])

  useEffect(() => {
    if (!esEditable || !generalLockHeldRef.current || !generalDirtyRef.current || isSavingGeneral) return
    if (generalAutosaveTimerRef.current !== null) window.clearTimeout(generalAutosaveTimerRef.current)
    generalAutosaveTimerRef.current = window.setTimeout(() => { void persistGeneralAutosave() }, GENERAL_AUTOSAVE_DELAY_MS)
    return () => { if (generalAutosaveTimerRef.current !== null) { window.clearTimeout(generalAutosaveTimerRef.current); generalAutosaveTimerRef.current = null } }
  }, [currentGeneralSnapshot, esEditable, isSavingGeneral, persistGeneralAutosave])

  useEffect(() => {
    if (!esEditable || !totalsLockHeldRef.current || !totalsDirtyRef.current || isSavingTotals) return
    if (totalsAutosaveTimerRef.current !== null) window.clearTimeout(totalsAutosaveTimerRef.current)
    totalsAutosaveTimerRef.current = window.setTimeout(() => { void persistTotalsAutosave() }, TOTALS_AUTOSAVE_DELAY_MS)
    return () => { if (totalsAutosaveTimerRef.current !== null) { window.clearTimeout(totalsAutosaveTimerRef.current); totalsAutosaveTimerRef.current = null } }
  }, [currentTotalsSnapshot, esEditable, isSavingTotals, persistTotalsAutosave])

  useEffect(() => {
    const remoteNotasSaves = savedSections.notas || 0
    if (!remoteNotasSaves || notasLockHeldRef.current || isSavingNotas) return
    fetchQuotationDetail(id).then((updated) => applyNotasOnly(updated.notas_internas ?? null)).catch((loadError) => console.error('[cotizaciones/[id]] Error refrescando notas tras save remoto:', loadError))
  }, [applyNotasOnly, id, isSavingNotas, savedSections.notas])

  useEffect(() => {
    const remoteGeneralSaves = savedSections.general || 0
    if (!remoteGeneralSaves || generalLockHeldRef.current || isSavingGeneral) return
    fetchQuotationDetail(id).then((updated) => applyGeneralOnly(updated)).catch((loadError) => console.error('[cotizaciones/[id]] Error refrescando general tras save remoto:', loadError))
  }, [applyGeneralOnly, id, isSavingGeneral, savedSections.general])

  useEffect(() => {
    const remoteTotalsSaves = savedSections.totales || 0
    if (!remoteTotalsSaves || totalsLockHeldRef.current || isSavingTotals) return
    fetchQuotationDetail(id).then((updated) => applyTotalsOnly(updated)).catch((loadError) => console.error('[cotizaciones/[id]] Error refrescando totales tras save remoto:', loadError))
  }, [applyTotalsOnly, id, isSavingTotals, savedSections.totales])

  useEffect(() => {
    if (!latestItemMutation) return
    if (hasLocalItemRowActivity(latestItemMutation.row_id)) return
    if (latestItemMutation.action === 'delete') {
      removeLocalItemState(latestItemMutation.row_id)
      return
    }
    if (latestItemMutation.item) {
      // Si ya tenemos la fila, se fusiona celda a celda (sin tocar lo que el usuario
      // esté editando). Si es una fila nueva de otro colaborador, se inserta con
      // `replace` sobre la lista completa: un `append` suelto aquí desalineaba el
      // arreglo de sus valores y hacía que se vieran filas con montos en blanco.
      if (getItemIndexByRowId(latestItemMutation.item.id) >= 0) {
        upsertLocalItemState(latestItemMutation.item, { preserveLocalEdits: true })
      } else {
        // `shouldFocus: false` es imprescindible: react-hook-form enfoca por defecto
        // la fila recién añadida, así que la fila de otro colaborador te robaba el
        // cursor mientras escribías.
        append(mapItemToFormItem(latestItemMutation.item), { shouldFocus: false })
      }
    }
  }, [append, getItemIndexByRowId, hasLocalItemRowActivity, latestItemMutation, removeLocalItemState, upsertLocalItemState])

  // El cambio ajeno llega completo por `item_mutation`, que es un dato empujado por su
  // autor. Antes cada guardado ajeno disparaba además una relectura completa: esa
  // relectura viajaba con una foto vieja y al volver borraba lo recién capturado.
  // El resync completo queda solo como red de seguridad al reconectar el canal.
  const estabaConectadoRef = useRef(isConnected)
  useEffect(() => {
    const acabaDeReconectar = isConnected && !estabaConectadoRef.current
    estabaConectadoRef.current = isConnected
    if (acabaDeReconectar) void reconciliarConServidor()
  }, [isConnected, reconciliarConServidor])

  // Latido de reconciliación. No depende de la presencia ni del canal: si dependiera,
  // un fallo de esos mismos mecanismos volvería a dejar las pantallas divergentes sin
  // que nadie se entere, que es exactamente lo que pasaba antes.
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

  useEffect(() => { if (!generalLockHeldRef.current) return; if (!areGeneralSnapshotsEqual(currentGeneralSnapshot, lastSavedGeneralRef.current)) generalDirtyRef.current = true }, [currentGeneralSnapshot])
  useEffect(() => { if (!totalsLockHeldRef.current) return; if (!areTotalsSnapshotsEqual(currentTotalsSnapshot, lastSavedTotalsRef.current)) totalsDirtyRef.current = true }, [currentTotalsSnapshot])

  useEffect(() => () => {
    if (notasAutosaveTimerRef.current !== null) window.clearTimeout(notasAutosaveTimerRef.current)
    if (generalAutosaveTimerRef.current !== null) window.clearTimeout(generalAutosaveTimerRef.current)
    if (totalsAutosaveTimerRef.current !== null) window.clearTimeout(totalsAutosaveTimerRef.current)
    clearNotasIdleReleaseTimer(); clearGeneralIdleReleaseTimer(); clearTotalsIdleReleaseTimer()
    Object.values(itemCellAutosaveTimersRef.current).forEach((timer) => timer && window.clearTimeout(timer))
    Object.values(itemCellIdleReleaseTimersRef.current).forEach((timer) => timer && window.clearTimeout(timer))
  }, [clearGeneralIdleReleaseTimer, clearNotasIdleReleaseTimer, clearTotalsIdleReleaseTimer])

  const handleNotasFocus = useCallback(() => { if (!esEditable) return; clearNotasIdleReleaseTimer(); notasFocusedRef.current = true; if (!notasLockHeldRef.current) { notasLockHeldRef.current = true; setActiveSection('notas') } }, [clearNotasIdleReleaseTimer, esEditable, setActiveSection])
  const handleGeneralFocus = useCallback(() => { if (!esEditable) return; clearGeneralIdleReleaseTimer(); generalFocusedRef.current = true; if (!generalLockHeldRef.current) { generalLockHeldRef.current = true; setActiveSection('general') } }, [clearGeneralIdleReleaseTimer, esEditable, setActiveSection])
  const handleTotalsFocus = useCallback(() => { if (!esEditable) return; clearTotalsIdleReleaseTimer(); totalsFocusedRef.current = true; if (!totalsLockHeldRef.current) { totalsLockHeldRef.current = true; setActiveSection('totales') } }, [clearTotalsIdleReleaseTimer, esEditable, setActiveSection])

  const handleNotasBlur = useCallback((event: FocusEvent<HTMLDivElement>) => { if (!esEditable) return; const nextTarget = event.relatedTarget as Node | null; if (nextTarget && notasSectionRef.current?.contains(nextTarget)) return; window.setTimeout(() => { const activeElement = document.activeElement; if (activeElement && notasSectionRef.current?.contains(activeElement)) return; notasFocusedRef.current = false; clearNotasIdleReleaseTimer(); if (notasDirtyRef.current) { void persistNotasAutosave(); return } notasLockHeldRef.current = false; releaseSection('notas') }, 0) }, [clearNotasIdleReleaseTimer, esEditable, persistNotasAutosave, releaseSection])
  const handleGeneralBlur = useCallback((event: FocusEvent<HTMLDivElement>) => { if (!esEditable) return; const nextTarget = event.relatedTarget as Node | null; if (nextTarget && generalSectionRef.current?.contains(nextTarget)) return; window.setTimeout(() => { const activeElement = document.activeElement; if (activeElement && generalSectionRef.current?.contains(activeElement)) return; generalFocusedRef.current = false; clearGeneralIdleReleaseTimer(); if (generalDirtyRef.current) { void persistGeneralAutosave(); return } generalLockHeldRef.current = false; releaseSection('general') }, 0) }, [clearGeneralIdleReleaseTimer, esEditable, persistGeneralAutosave, releaseSection])
  const handleTotalsBlur = useCallback((event: FocusEvent<HTMLDivElement>) => { if (!esEditable) return; const nextTarget = event.relatedTarget as Node | null; if (nextTarget && totalsSectionRef.current?.contains(nextTarget)) return; window.setTimeout(() => { const activeElement = document.activeElement; if (activeElement && totalsSectionRef.current?.contains(activeElement)) return; totalsFocusedRef.current = false; clearTotalsIdleReleaseTimer(); if (totalsDirtyRef.current) { void persistTotalsAutosave(); return } totalsLockHeldRef.current = false; releaseSection('totales') }, 0) }, [clearTotalsIdleReleaseTimer, esEditable, persistTotalsAutosave, releaseSection])

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

  const trackedHandleClienteChange = useCallback((value: string) => { handleGeneralFocus(); generalDirtyRef.current = true; handleClienteChange(value) }, [handleClienteChange, handleGeneralFocus])
  const trackedHandleProyectoChange = useCallback((value: string) => { handleGeneralFocus(); generalDirtyRef.current = true; handleProyectoChange(value) }, [handleGeneralFocus, handleProyectoChange])
  const trackedSelectCliente = useCallback((value: string) => { handleGeneralFocus(); generalDirtyRef.current = true; seleccionarCliente(value) }, [handleGeneralFocus, seleccionarCliente])
  const trackedSelectProyecto = useCallback((value: string) => { handleGeneralFocus(); generalDirtyRef.current = true; seleccionarProyecto(value) }, [handleGeneralFocus, seleccionarProyecto])
  const trackedHandleFechaEntregaChange = useCallback(() => { handleGeneralFocus(); generalDirtyRef.current = true }, [handleGeneralFocus])
  const trackedHandleLocacionChange = useCallback(() => { handleGeneralFocus(); generalDirtyRef.current = true }, [handleGeneralFocus])
  const trackedSetPorcentajeFee = useCallback((value: number) => { handleTotalsFocus(); totalsDirtyRef.current = true; porcentajeFeeValueRef.current = value; setPorcentajeFee(value) }, [handleTotalsFocus])
  const trackedSetIvaActivo = useCallback((value: boolean | ((prev: boolean) => boolean)) => { handleTotalsFocus(); totalsDirtyRef.current = true; const nextValue = typeof value === 'function' ? value(ivaActivoValueRef.current) : value; ivaActivoValueRef.current = nextValue; setIvaActivo(nextValue) }, [handleTotalsFocus])
  const trackedSetDescuentoTipo = useCallback((value: 'monto' | 'porcentaje') => { handleTotalsFocus(); totalsDirtyRef.current = true; descuentoTipoValueRef.current = value; setDescuentoTipo(value) }, [handleTotalsFocus])
  const trackedSetDescuentoValor = useCallback((value: number) => { handleTotalsFocus(); totalsDirtyRef.current = true; descuentoValorValueRef.current = value; setDescuentoValor(value) }, [handleTotalsFocus])

  const handleItemFieldFocus = useCallback((rowId: string, field: QuotationItemCellField) => {
    const key = getItemCellKey(rowId, field)
    clearItemCellIdleReleaseTimer(key)
    itemFocusedCellsRef.current.add(key)
    lockItemCell(rowId, field)
  }, [clearItemCellIdleReleaseTimer, lockItemCell])

  const handleItemFieldChange = useCallback((rowId: string, field: QuotationItemCellField) => {
    const key = getItemCellKey(rowId, field)
    markLocalWrite(rowId, field)
    itemDirtyCellsRef.current.add(key)
    itemFocusedCellsRef.current.add(key)
    lockItemCell(rowId, field)
    clearItemCellIdleReleaseTimer(key)
    clearItemCellAutosaveTimer(key)
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
    // La fila se pinta de inmediato con un id provisional; el POST viaja detrás. Antes
    // había que esperar el viaje completo al servidor para verla aparecer.
    const tempId = `${TEMP_ROW_PREFIX}${crypto.randomUUID()}`
    append({ ...EMPTY_QUOTATION_ITEM, id: tempId, precio_unitario: 0, x_pagar: 0 })

    const creation = createQuotationItemRow()
      .then((createdItem) => {
        if (!createdItem) throw new Error('No se pudo crear la fila')
        return createdItem.id
      })
    pendingRowIdsRef.current.set(tempId, creation)

    try {
      const createdId = await creation
      const index = getItemIndexByRowId(tempId)
      if (index >= 0) setValue(`items.${index}.id`, createdId)
      migrateRowKeys(tempId, createdId)
      const filaCreada: ItemCotizacion = { id: createdId, cotizacion_id: id, categoria: '', descripcion: '', cantidad: 1, precio_unitario: 0, importe: 0, responsable_id: null, responsable_nombre: null, x_pagar: 0, margen: 0, orden: (getValues('items') || []).length, notas: null }
      setCotizacion((prev) => prev ? { ...prev, items: [...(prev.items || []), filaCreada] } : prev)
      broadcastItemMutation({ action: 'upsert', row_id: createdId, item: filaCreada })
      markSectionSaved('partidas')
    } catch (createError: unknown) {
      const index = getItemIndexByRowId(tempId)
      if (index >= 0) remove(index)
      setError(createError instanceof Error ? createError.message : 'Error creando partida')
      void resyncPartidas()
    } finally {
      pendingRowIdsRef.current.delete(tempId)
    }
  }, [append, broadcastItemMutation, createQuotationItemRow, getItemIndexByRowId, getValues, id, markSectionSaved, migrateRowKeys, remove, resyncPartidas, setValue])

  const handleImportItems = useCallback(async (items: ImportableItem[]) => {
    if (items.length === 0) return
    setImportingItems(true)
    try {
      // Las filas en blanco que ya existen se reutilizan (conservan su posición) y las
      // que sobren se borran en la misma petición.
      const reemplazarIds = (getValues('items') || [])
        .filter((item) => isBlankQuotationItem(item))
        .map((item) => item.id)
        .filter((rowId): rowId is string => !!rowId && !rowId.startsWith(TEMP_ROW_PREFIX))

      const response = await fetch(`/api/cotizaciones/${id}/items/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((sourceItem) => ({
            categoria: sourceItem.categoria || '',
            descripcion: sourceItem.descripcion || '',
            cantidad: sourceItem.cantidad || 1,
            precio_unitario: sourceItem.precio_unitario || 0,
            x_pagar: sourceItem.x_pagar || 0,
            responsable_id: sourceItem.responsable_id || '',
            responsable_nombre: sourceItem.responsable_nombre || '',
          })),
          reemplazar_ids: reemplazarIds,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Error copiando partidas')

      const updated = data?.cotizacion as Cotizacion | undefined
      if (!updated) throw new Error('Respuesta inválida al copiar partidas')

      // Se aplica la lista completa de una vez (nada de append + setValue, que era lo
      // que dejaba una fila fuera del subtotal). Solo se tocan partidas y totales del
      // encabezado: cliente, proyecto, notas y config de totales pueden estar en
      // edición en otra sección y no deben pisarse.
      // Las filas provisionales siguen siendo del usuario: el servidor aún no las
      // conoce, y descartarlas las dejaba invisibles hasta recargar.
      const provisionales = (getValues('items') || []).filter((item) => item.id?.startsWith(TEMP_ROW_PREFIX))
      replace([...(updated.items || []).map(mapItemToFormItem), ...provisionales])
      setCotizacion((prev) => prev ? { ...prev, items: updated.items || [], subtotal: updated.subtotal, fee_agencia: updated.fee_agencia, general: updated.general, iva: updated.iva, total: updated.total, margen_total: updated.margen_total, utilidad_total: updated.utilidad_total } : updated)
      for (const item of updated.items || []) {
        broadcastItemMutation({ action: 'upsert', row_id: item.id, item })
      }
      markSectionSaved('partidas')
    } catch (importError: unknown) {
      setError(importError instanceof Error ? importError.message : 'Error copiando partidas')
      void resyncPartidas()
    } finally {
      setImportingItems(false)
    }
  }, [broadcastItemMutation, getValues, id, markSectionSaved, replace, resyncPartidas])

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
      await enqueueRowMutation(rowId, () => deleteQuotationItemRow(rowId))
      pendingRowRemovalsRef.current.delete(rowId)
      broadcastItemMutation({ action: 'delete', row_id: rowId })
      markSectionSaved('partidas')
    } catch (deleteError: unknown) {
      pendingRowRemovalsRef.current.delete(rowId)
      setError(deleteError instanceof Error ? deleteError.message : 'Error eliminando partida')
      void resyncPartidas()
    }
  }, [broadcastItemMutation, deleteQuotationItemRow, enqueueRowMutation, getItemIndexByRowId, getValues, markSectionSaved, replace, resyncPartidas])

  const handleSelectProduct = useCallback(async (rowId: string, producto: { descripcion: string; categoria: string | null; precio_unitario: number; x_pagar_sugerido: number }) => {
    const index = getItemIndexByRowId(rowId)
    if (index < 0) return
    seleccionarProducto(index, producto as never)
    try {
      const updatedItem = await enqueueRowMutation(rowId, () => patchQuotationItem(rowId, { descripcion: producto.descripcion, categoria: producto.categoria || '', precio_unitario: producto.precio_unitario || 0, x_pagar: producto.x_pagar_sugerido || 0 }))
      if (updatedItem) {
        upsertLocalItemState(updatedItem, { preserveLocalEdits: true })
        broadcastItemMutation({ action: 'upsert', row_id: rowId, item: updatedItem })
      }
      markSectionSaved('partidas')
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Error aplicando producto')
      void resyncPartidas()
    }
  }, [broadcastItemMutation, enqueueRowMutation, getItemIndexByRowId, markSectionSaved, patchQuotationItem, resyncPartidas, seleccionarProducto, upsertLocalItemState])

  const handleResponsableChange = useCallback(async (rowId: string, responsableId: string) => {
    const index = getItemIndexByRowId(rowId)
    if (index < 0) return
    const responsable = responsables.find((item) => item.id === responsableId)
    setValue(`items.${index}.responsable_id`, responsableId)
    setValue(`items.${index}.responsable_nombre`, responsable?.nombre ?? '')
    try {
      const updatedItem = await enqueueRowMutation(rowId, () => patchQuotationItem(rowId, { responsable_id: responsableId, responsable_nombre: responsable?.nombre ?? '' }))
      if (updatedItem) {
        upsertLocalItemState(updatedItem, { preserveLocalEdits: true })
        broadcastItemMutation({ action: 'upsert', row_id: rowId, item: updatedItem })
      }
      markSectionSaved('partidas')
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Error actualizando responsable')
      void resyncPartidas()
    }
  }, [broadcastItemMutation, enqueueRowMutation, getItemIndexByRowId, markSectionSaved, patchQuotationItem, resyncPartidas, responsables, setValue, upsertLocalItemState])

  // Presencia estilo Sheets: saber que alguien más está en una fila o celda sirve para
  // resaltarla y avisar, nunca para deshabilitar nada.
  const isItemRowLocked = useCallback((rowId: string) => !!itemRowEditors[rowId], [itemRowEditors])
  const isItemCellLocked = useCallback((rowId: string, field: QuotationItemCellField) => !!itemCellEditors[getItemCellKey(rowId, field)], [itemCellEditors])

  const getItemRowStatusText = useCallback((rowId: string) => {
    const rowEditor = itemRowEditors[rowId]
    if (rowEditor) return `${getShortName(rowEditor.name, rowEditor.email)} está trabajando esta fila`
    const cellEditor = Object.entries(itemCellEditors).find(([key]) => key.startsWith(`${rowId}:`))?.[1]
    if (cellEditor) return `${getShortName(cellEditor.name, cellEditor.email)} está editando una celda de esta fila`
    return null
  }, [itemCellEditors, itemRowEditors])


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
    isRowBusy: isItemRowLocked,
    isCellBusy: isItemCellLocked,
    rowStatusText: getItemRowStatusText,
    importing: importingItems,
  }), [getItemRowStatusText, handleAddRow, handleImportItems, handleItemFieldBlur, handleItemFieldChange, handleItemFieldFocus, handleRemoveRow, handleResponsableChange, handleSelectProduct, importingItems, isItemCellLocked, isItemRowLocked])

  const guardar = async (estado?: string): Promise<boolean> => {
    setGuardando(true)
    setError(null)
    try {
      const refreshedCotizacion = await updateQuotation(id, { cliente: watch('cliente'), proyecto: watch('proyecto'), fecha_entrega: watch('fecha_entrega'), locacion: watch('locacion'), items: watchedItems }, { porcentaje_fee, iva_activo, descuento_tipo, descuento_valor, responsables, currentQuotation: cotizacion, notas_internas: notasInternas || null, ...(estado ? { estado: estado as 'BORRADOR' | 'EMITIDA' | 'APROBADA' } : {}) })
      applyCotizacionToState(refreshedCotizacion)
      await refreshCatalogos()
      setSuccess('Guardado correctamente')
      setTimeout(() => setSuccess(null), 3000)
      return true
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
      return false
    } finally { setGuardando(false) }
  }

  const aprobar = async () => { setAprobando(true); setError(null); setSuccess(null); try { const ok = await guardar(); if (!ok) return; const fullCot = await approveQuotation(id); applyCotizacionToState(fullCot); await refreshCatalogos(); setSuccess('¡Cotización aprobada! Proyecto y cuentas creados.'); setTimeout(() => setSuccess(null), 4000) } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error al aprobar') } finally { setAprobando(false) } }
  const handlePdfResult = (result: { savedToDrive: boolean; driveWebViewLink?: string; driveError?: string }) => { if (result.savedToDrive) { setSuccess('PDF guardado exitosamente en Drive'); setDriveLink(result.driveWebViewLink ?? null) } else if (result.driveError) { setError(`Error al guardar en Drive: ${result.driveError}`); setDriveLink(null) } else { setError('No se pudo guardar el PDF en Drive'); setDriveLink(null) } setTimeout(() => { setSuccess(null); setError(null); setDriveLink(null) }, 10000) }
  const generarPDF = async () => { if (!cotizacion) return; setGenerandoPdf(true); setError(null); setSuccess(null); setDriveLink(null); try { const result = await generateQuotationPdf(cotizacion, undefined, { skipDownload: true }); handlePdfResult(result) } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error al generar PDF') } finally { setGenerandoPdf(false) } }
  const generarCotizacion = async () => { const ok = await guardar('EMITIDA'); if (!ok) return; const refreshedCotizacion = await fetchQuotationDetail(id); applyCotizacionToState(refreshedCotizacion); setGenerandoPdf(true); setError(null); setSuccess(null); setDriveLink(null); try { const result = await generateQuotationPdf(refreshedCotizacion, watchedItems, { skipDownload: true }); handlePdfResult(result) } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error al generar PDF') } finally { setGenerandoPdf(false) } }
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
          <Link href="/cotizaciones" className="flex flex-none items-center gap-1.5 text-content text-faint hover:text-subtext">
            <Icon name="arrow-left" size={14} />
            Cotizaciones
          </Link>
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
            {cotizacion.estado === 'EMITIDA' && <><button onClick={generarPDF} disabled={generandoPdf} className="border border-hairline bg-input hover:bg-row-alt text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{generandoPdf ? 'Guardando en Drive...' : 'Generar PDF'}</button><button onClick={cancelarCotizacion} disabled={cancelando} className="text-subtext hover:bg-white/5 hover:text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{cancelando ? 'Cancelando...' : 'Cancelar'}</button><button onClick={aprobar} disabled={aprobando || guardando} className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-3 rounded-control text-content font-semibold transition-colors disabled:opacity-50 min-h-[44px]">{aprobando ? 'Aprobando...' : 'Aprobar Cotización'}</button></>}
            {cotizacion.estado === 'APROBADA' && <><button onClick={generarPDF} disabled={generandoPdf} className="border border-hairline bg-input hover:bg-row-alt text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{generandoPdf ? 'Guardando en Drive...' : 'Generar PDF'}</button><button onClick={cancelarCotizacion} disabled={cancelando} className="text-subtext hover:bg-white/5 hover:text-body px-4 py-3 rounded-control text-content transition-colors disabled:opacity-50 min-h-[44px]">{cancelando ? 'Cancelando...' : 'Cancelar'}</button><button onClick={crearComplementaria} className="bg-accent hover:bg-accent-pressed text-accent-ink px-4 py-3 rounded-control text-content font-semibold transition-colors min-h-[44px]">Crear Complementaria</button></>}
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

      {error && <div className="rounded-control border border-cancelled-bg/60 bg-cancelled-bg/20 text-cancelled-fg px-4 py-3">{error}</div>}
      {success && <div className="rounded-control border border-approved-bg/60 bg-approved-bg/20 text-approved-fg px-4 py-3 flex items-center justify-between gap-4"><span>{success}</span>{driveLink && <a href={driveLink} target="_blank" rel="noopener noreferrer" className="underline text-content whitespace-nowrap hover:opacity-80">Ver en Drive →</a>}</div>}

      {!esEditable && (
        <div className="flex items-center gap-2.5 rounded-control border border-hairline bg-row px-4 py-3 text-content text-subtext">
          <Icon name="lock" size={14} className="flex-none text-faint" />
          Los datos generales y las partidas sólo se editan en Borrador o Emitida.
        </div>
      )}

      {(notasInternas || esEditable) && <div ref={notasSectionRef} className={`bg-row/60 border rounded-panel p-4 ${sectionEditors.notas ? 'border-accent-quiet/70' : 'border-hairline'}`} onFocusCapture={handleNotasFocus} onBlurCapture={handleNotasBlur}><SectionEditBadge section="notas" /><p className="sn-label mb-2">Notas del evento (uso interno)</p>{esEditable ? <textarea value={notasInternas} onChange={e => { handleNotasFocus(); notasDirtyRef.current = true; setNotasInternas(e.target.value) }} rows={3} placeholder="Sin notas..." className="w-full bg-transparent text-body text-content resize-none outline-none placeholder-faint disabled:opacity-50 disabled:cursor-not-allowed" /> : <p className="text-subtext text-content whitespace-pre-wrap">{notasInternas || '—'}</p>}</div>}

      <div ref={generalSectionRef} className={`rounded-panel ${sectionEditors.general ? 'ring-1 ring-accent-quiet/70' : ''}`} onFocusCapture={handleGeneralFocus} onBlurCapture={handleGeneralBlur}>
        <div className="px-1"><SectionEditBadge section="general" /></div>
        <QuotationGeneralInfoSection register={register} setValue={setValue} clienteInput={clienteInput} proyectoInput={proyectoInput} clienteSugerencias={clienteSugerencias} mostrarClienteDropdown={mostrarClienteDropdown} setMostrarClienteDropdown={setMostrarClienteDropdown} proyectosDelCliente={proyectosDelCliente} mostrarProyectoDropdown={mostrarProyectoDropdown} setMostrarProyectoDropdown={setMostrarProyectoDropdown} listaClientes={listaClientes} handleClienteChange={trackedHandleClienteChange} handleProyectoChange={trackedHandleProyectoChange} seleccionarCliente={seleccionarCliente} setProyectoInput={setProyectoInput} onClienteSelected={trackedSelectCliente} onProyectoSelected={trackedSelectProyecto} onFechaEntregaChange={trackedHandleFechaEntregaChange} onLocacionChange={trackedHandleLocacionChange} isReadOnly={!esEditable} readOnlyDisplay={esEditable ? 'input' : 'text'} dateLabel={formatDateDisplay(cotizacion.fecha_cotizacion)} fechaEntregaValue={watch('fecha_entrega')} locacionValue={watch('locacion')} />
      </div>

      <div ref={partidasSectionRef} className={`rounded-panel ${sectionEditors.partidas ? 'ring-1 ring-accent-quiet/70 ring-offset-0' : ''}`} onFocusCapture={() => esEditable && setActiveSection('partidas')} onBlurCapture={handlePartidasBlur}>
        <div className="px-1"><SectionEditBadge section="partidas" /></div>
        <QuotationItemsSection editable={!!esEditable} register={register} watchedItems={watchedItems} fields={fields} editingItemIndex={editingItemIndex} setEditingItemIndex={setEditingItemIndex} calcItem={calcItem} handleDescripcionChange={handleDescripcionChange} productoSugerencias={productoSugerencias} mostrarProductoDropdown={mostrarProductoDropdown} setMostrarProductoDropdown={setMostrarProductoDropdown} responsables={responsables} readOnlyItems={cotizacion.items || []} onCopyClick={() => setShowCopyModal(true)} items={itemsController} />      </div>

      <QuotationCopyItemsModal open={showCopyModal} onClose={() => setShowCopyModal(false)} excludeCotizacionId={id} onImport={handleImportItems} />

      <div ref={totalsSectionRef} className={`rounded-panel ${sectionEditors.totales ? 'ring-1 ring-accent-quiet/70' : ''}`} onFocusCapture={handleTotalsFocus} onBlurCapture={handleTotalsBlur}>
        <div className="px-1"><SectionEditBadge section="totales" /></div>
        <QuotationTotalsPanels totals={displayTotales} editable={!!esEditable} porcentaje_fee={porcentaje_fee} setPorcentajeFee={trackedSetPorcentajeFee} iva_activo={iva_activo} setIvaActivo={trackedSetIvaActivo} descuento_tipo={descuento_tipo} setDescuentoTipo={trackedSetDescuentoTipo} descuento_valor={descuento_valor} setDescuentoValor={trackedSetDescuentoValor} estimatedTaxes={estimatedTaxes} />
      </div>
    </div>
  )
}
