'use client'

import { FocusEvent, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { StatusBadge, toneForCotizacionEstado } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Cotizacion, ItemCotizacion, Proveedor } from '@/lib/types'
import { useQuotationForm } from '@/hooks/useQuotationForm'
import { QuotationItemCellField, QuotationPresenceSection, useQuotationPresence } from '@/hooks/useQuotationPresence'
import { ImportableItem, QuotationItemsController } from '@/hooks/useQuotationItems'
import { calculateEstimatedTaxes, calculateQuotationTotals } from '@/lib/quotations/calculations'
import { buildReadOnlyTotals, EMPTY_QUOTATION_ITEM, isBlankQuotationItem, reconcileServerItems } from '@/lib/quotations/mappers'
import { QuotationFormValues } from '@/lib/quotations/types'
import { approveQuotation, buildComplementariaUrl, emitirCotizacion, fetchQuotationDetail, fetchProveedores, generateQuotationPdf, saveQuotationNotes } from '@/lib/services/quotation-service'
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

type QuotationGeneralField = keyof GeneralSnapshot
type QuotationTotalsField = keyof TotalsSnapshot

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

function buildTotalsSnapshot(values: Partial<TotalsSnapshot>): TotalsSnapshot {
  return {
    porcentaje_fee: typeof values.porcentaje_fee === 'number' ? values.porcentaje_fee : 0.15,
    iva_activo: typeof values.iva_activo === 'boolean' ? values.iva_activo : true,
    descuento_tipo: values.descuento_tipo === 'porcentaje' ? 'porcentaje' : 'monto',
    descuento_valor: typeof values.descuento_valor === 'number' ? values.descuento_valor : 0,
  }
}

function getItemCellKey(rowId: string, field: QuotationItemCellField) {
  return `${rowId}:${field}`
}

/**
 * Detalle de un campo en conflicto, tal como lo devuelven las RPCs
 * patch_item_cotizacion / patch_cotizacion_general / patch_cotizacion_totales.
 */
interface FieldConflictDetail {
  base: unknown
  current: unknown
  attempted: unknown
}

/**
 * El PATCH (de una partida, de General o de Totales) rechazó el intento
 * porque el valor cambió en el servidor desde que se capturó el "base"
 * (alguien más lo editó primero). `fields` viene indexado por la clave del
 * patch (p. ej. "descripcion", "locacion", "descuento_valor").
 */
class PatchConflictError extends Error {
  fields: Record<string, FieldConflictDetail>
  constructor(fields: Record<string, FieldConflictDetail>) {
    super('conflict')
    this.name = 'PatchConflictError'
    this.fields = fields
  }
}

/**
 * Construye el "base" a mandar en el próximo PATCH de este campo: el valor
 * confirmado por el servidor en el momento en que el usuario empezó a
 * editarlo. Sin esto (fila recién creada cuyo alta sigue en vuelo) no hay
 * base posible -- ese PATCH sobreescribe sin comparar, igual que siempre.
 */
function buildItemFieldBase(server: ItemCotizacion | undefined, field: QuotationItemCellField): Record<string, unknown> | null {
  if (!server) return null
  switch (field) {
    case 'categoria': return { categoria: server.categoria ?? '' }
    case 'descripcion': return { descripcion: server.descripcion ?? '' }
    case 'cantidad': return { cantidad: server.cantidad ?? 0 }
    case 'precio_unitario': return { precio_unitario: server.precio_unitario ?? 0 }
    case 'x_pagar': return { x_pagar: server.x_pagar ?? 0 }
    case 'responsable_id': return { responsable_id: server.responsable_id ?? '', responsable_nombre: server.responsable_nombre ?? '' }
  }
}

/**
 * Igual que `buildItemFieldBase`, pero para una operación multi-campo (seleccionar
 * producto, cambiar responsable): junta la base de cada campo que la operación toca
 * en un solo objeto, para que la RPC evalúe conflicto de forma atómica sobre todos
 * a la vez -- si cualquiera está desactualizado, se rechaza la operación completa.
 */
function buildItemFieldsBase(server: ItemCotizacion | undefined, fields: QuotationItemCellField[]): Record<string, unknown> | null {
  if (!server) return null
  return fields.reduce<Record<string, unknown>>((acc, field) => ({ ...acc, ...(buildItemFieldBase(server, field) ?? {}) }), {})
}

/**
 * `patch_item_cotizacion` es atómica por diseño (ver la migración): si
 * CUALQUIER campo del patch está en conflicto, la RPC rechaza la operación
 * COMPLETA sin aplicar nada -- ni siquiera los campos que sí coincidían con
 * su `base`. `saveError.fields` solo trae el detalle de los campos que la
 * RPC detectó en conflicto; un campo del grupo ausente ahí no significa que
 * sí se guardó -- significa que su valor en el servidor sigue siendo
 * exactamente su `base` (por eso no se marcó), y lo que este PATCH intentó
 * para ese campo nunca llegó a aplicarse. Sin esto, "Usar"/"Mantener" solo
 * tocaban los campos que individualmente aparecían en `saveError.fields` y
 * dejaban el resto del grupo mostrando un valor que jamás se guardó como si
 * fuera el vigente.
 */
function buildAtomicConflictRecord(
  fields: QuotationItemCellField[],
  base: Record<string, unknown> | null,
  attemptedPatch: Record<string, unknown>,
  saveError: PatchConflictError
): Record<string, FieldConflictDetail> {
  const record: Record<string, FieldConflictDetail> = {}
  for (const field of fields) {
    record[field] = saveError.fields[field] ?? { base: base?.[field], current: base?.[field], attempted: attemptedPatch[field] }
  }
  return record
}

/**
 * Misma coerción que ya arma el `patch` de cada campo de partida (ver
 * `sendItemCellPatchRound`). `attempted`/`current` de la RPC pueden diferir de
 * lo que hay en el formulario por representación (`null` vs `''`, `"10"` vs
 * `10`), no solo por dato real -- comparar con esta normalización, no con
 * `===` crudo, para decidir si un conflicto es "idéntico" (se resuelve solo).
 */
function normalizeItemFieldValue(field: QuotationItemCellField, value: unknown): unknown {
  switch (field) {
    case 'categoria':
    case 'descripcion':
    case 'responsable_id':
      return value || ''
    case 'cantidad':
      return Number(value) || 0
    case 'precio_unitario':
    case 'x_pagar':
      return value === '' || value === null || value === undefined ? 0 : Number(value) || 0
  }
}

/** Mismo principio que `normalizeItemFieldValue`, para los campos de General. */
function normalizeGeneralFieldValue(value: unknown): string {
  return value ? String(value) : ''
}

/**
 * Mismo principio que `normalizeItemFieldValue`, para los campos de Totales --
 * misma coerción que ya aplican `getTotalsFieldValue`/`resolveTotalsFieldConflict`.
 */
function normalizeTotalsFieldValue(field: QuotationTotalsField, value: unknown): unknown {
  switch (field) {
    case 'porcentaje_fee':
    case 'descuento_valor':
      return value === '' || value === null || value === undefined ? 0 : Number(value) || 0
    case 'iva_activo':
      return Boolean(value)
    case 'descuento_tipo':
      return value === 'porcentaje' ? 'porcentaje' : 'monto'
  }
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
  // Id estable de la fila que edita la tarjeta móvil, no su índice: un `replace()`
  // de reconciliación (alta/baja de un colaborador) cambia qué índice apunta a cuál
  // fila, y un índice guardado quedaba apuntando a la fila equivocada -- ver
  // `QuotationItemsSection`, que recalcula el índice en cada render a partir de este id.
  const [editingItemRowId, setEditingItemRowId] = useState<string | null>(null)
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
  const notasIdleReleaseTimerRef = useRef<number | null>(null)
  const generalIdleReleaseTimerRef = useRef<number | null>(null)
  const totalsIdleReleaseTimerRef = useRef<number | null>(null)
  const notasDirtyRef = useRef(false)
  // Fase 8.7 (Bloque 1): guard contra doble disparo -- ver el comentario junto
  // a flushGeneralDirtyFields. Notas no tiene un "flush de todos los campos
  // dirty" separado (es un solo campo), así que el guard vive directo en
  // persistNotasAutosave: si ya hay un guardado en vuelo, se devuelve esa
  // misma promesa en vez de disparar un segundo PATCH concurrente.
  const notasInFlightRef = useRef<Promise<unknown> | null>(null)
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
  // Drenado real para General/Totales (mismo "causa F" que itemCellDrainRef/
  // itemCellRetryNeededRef abajo, portado desde partidas -- Fase 8.7.2 lo dejó
  // resuelto solo para partidas; General y Totales seguían limpiando su dirty
  // sin importar si ya había un reintento encolado con un valor más nuevo,
  // produciendo un conflicto contra sí mismos con ediciones rápidas seguidas
  // (p. ej. alternar el switch de IVA dos veces antes de que el primer PATCH
  // resuelva). Mientras un campo ya tiene una ronda de PATCH en vuelo, una
  // edición nueva sobre el MISMO campo no dispara un segundo `fetch` en
  // paralelo -- solo marca el `RetryNeeded` y el drenado, al terminar su ronda
  // actual, manda una ronda más con el valor final.
  const generalFieldDrainRef = useRef<Map<QuotationGeneralField, Promise<unknown>>>(new Map())
  const generalFieldRetryNeededRef = useRef<Set<QuotationGeneralField>>(new Set())
  const totalsFieldDrainRef = useRef<Map<QuotationTotalsField, Promise<unknown>>>(new Map())
  const totalsFieldRetryNeededRef = useRef<Set<QuotationTotalsField>>(new Set())
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

  // Fase 8 (hardening pre-Proyectos): todo PATCH saliente (partidas, general,
  // totales, notas) se registra aquí mientras está en vuelo. `flushPendingSaves`
  // lo usa antes de Emitir/Aprobar -- sin esto, un PATCH disparado por un blur
  // justo antes de pulsar el botón podía seguir en vuelo cuando se leía el
  // estado "canónico" del servidor, y esa lectura llegaba más vieja que el
  // propio cambio del usuario que está aprobando. Deliberadamente simple: no es
  // una cola ni un tracker global, solo una foto de "lo que ya estaba en
  // camino" en el instante exacto del click -- lo que se dispare después no se
  // espera aquí.
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
  const clearGeneralFieldConflict = useCallback((field: QuotationGeneralField) => {
    setGeneralFieldConflicts((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])
  const clearTotalsFieldConflict = useCallback((field: QuotationTotalsField) => {
    setTotalsFieldConflicts((prev) => {
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
  const clearTotalsFieldTimer = useCallback((field: QuotationTotalsField) => {
    const timer = totalsFieldTimersRef.current[field]
    if (timer) window.clearTimeout(timer)
    totalsFieldTimersRef.current[field] = null
  }, [])
  const lastSavedNotasRef = useRef('')
  // Último valor de General/Totales confirmado por el servidor -- la fuente del
  // "base" que se manda en cada PATCH de campo para detectar conflictos. Mismo
  // patrón que itemsServerRef para partidas: nunca se pisa con lo que el usuario
  // está tecleando (eso vive solo en el form / en los *ValueRef de abajo).
  const generalServerRef = useRef<GeneralSnapshot>(buildGeneralSnapshot({}))
  const totalsServerRef = useRef<TotalsSnapshot>(buildTotalsSnapshot({}))
  // Campos de General/Totales con una edición local sin confirmar. Reemplaza el
  // booleano de sección única: dos campos de la misma sección ahora se guardan
  // (y detectan conflicto) de forma independiente, así "A edita Fecha y B edita
  // Locación" ya no puede pisarse -- cada PATCH manda solo su propio campo.
  const generalFieldDirtyRef = useRef<Set<QuotationGeneralField>>(new Set())
  const totalsFieldDirtyRef = useRef<Set<QuotationTotalsField>>(new Set())
  const generalFieldSavingRef = useRef<Set<QuotationGeneralField>>(new Set())
  const totalsFieldSavingRef = useRef<Set<QuotationTotalsField>>(new Set())
  // "base" capturado por campo (al empezar a editarlo), listo para el próximo PATCH.
  const generalFieldBaseRef = useRef<Partial<Record<QuotationGeneralField, unknown>>>({})
  const totalsFieldBaseRef = useRef<Partial<Record<QuotationTotalsField, unknown>>>({})
  const generalFieldTimersRef = useRef<Partial<Record<QuotationGeneralField, number | null>>>({})
  const totalsFieldTimersRef = useRef<Partial<Record<QuotationTotalsField, number | null>>>({})
  const [generalFieldConflicts, setGeneralFieldConflicts] = useState<Partial<Record<QuotationGeneralField, FieldConflictDetail>>>({})
  const [totalsFieldConflicts, setTotalsFieldConflicts] = useState<Partial<Record<QuotationTotalsField, FieldConflictDetail>>>({})

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

  const getCurrentNotasSnapshot = useCallback(() => notasValueRef.current.trim() ? notasValueRef.current : '', [])
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

  // Fetch crudo (no sendJson/getJson): esos helpers colapsan cualquier respuesta
  // no-2xx en un Error genérico y perderían el payload {fields} del 409, igual
  // que patchQuotationItem arriba. Ídem nota de trackMutation arriba.
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
    const notas = cot.notas_internas ?? ''
    const general = buildGeneralSnapshot({ cliente: cot.cliente, proyecto: cot.proyecto, fecha_entrega: cot.fecha_entrega || '', locacion: cot.locacion || '' })
    const totalsConfig = buildTotalsSnapshot({ porcentaje_fee: cot.porcentaje_fee, iva_activo: cot.iva_activo, descuento_tipo: cot.descuento_tipo, descuento_valor: cot.descuento_valor })
    setNotasInternas(notas)
    notasValueRef.current = notas
    lastSavedNotasRef.current = notas
    notasDirtyRef.current = false
    generalServerRef.current = general
    generalDirtyRef.current = false
    generalFieldDirtyRef.current.clear()
    generalFieldBaseRef.current = {}
    setGeneralFieldConflicts({})
    totalsServerRef.current = totalsConfig
    totalsDirtyRef.current = false
    totalsFieldDirtyRef.current.clear()
    totalsFieldBaseRef.current = {}
    setTotalsFieldConflicts({})
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
    for (const item of cot.items || []) recordServerItem(item)
    reset({ cliente: cot.cliente, proyecto: cot.proyecto, fecha_entrega: cot.fecha_entrega || '', locacion: cot.locacion || '', items: (cot.items || []).map(mapItemToFormItem) })
  }, [recordServerItem, reset, setClienteInput, setProyectoInput])

  const applyNotasOnly = useCallback((notas: string | null) => { const normalized = notas ?? ''; setNotasInternas(normalized); notasValueRef.current = normalized; lastSavedNotasRef.current = normalized; notasDirtyRef.current = false; setCotizacion((prev) => (prev ? { ...prev, notas_internas: notas } : prev)) }, [])
  // Refresco tras un save remoto: NUNCA pisa un campo con una edición o un guardado
  // propio en vuelo (mismo criterio que `isCellBusy` en partidas). Antes esto se
  // saltaba la sección COMPLETA si cualquier campo estaba sucio -- con eso, editar
  // Fecha dejaba a Locación viendo una foto vieja aunque nadie la estuviera tocando.
  const applyGeneralOnly = useCallback((cot: Cotizacion) => {
    const general = buildGeneralSnapshot({ cliente: cot.cliente, proyecto: cot.proyecto, fecha_entrega: cot.fecha_entrega || '', locacion: cot.locacion || '' })
    generalServerRef.current = general
    const isFieldBusy = (field: QuotationGeneralField) => generalFieldDirtyRef.current.has(field) || generalFieldSavingRef.current.has(field)
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
  }, [setClienteInput, setProyectoInput, setValue])
  const applyTotalsOnly = useCallback((cot: Cotizacion) => {
    const totalsConfig = buildTotalsSnapshot({ porcentaje_fee: cot.porcentaje_fee, iva_activo: cot.iva_activo, descuento_tipo: cot.descuento_tipo, descuento_valor: cot.descuento_valor })
    totalsServerRef.current = totalsConfig
    const isFieldBusy = (field: QuotationTotalsField) => totalsFieldDirtyRef.current.has(field) || totalsFieldSavingRef.current.has(field)
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
  }, [])

  // Red de seguridad única: ante cualquier fallo del servidor se vuelve a leer la
  // cotización y se reconstruye la tabla, en vez de parchear el estado local a mano
  // (que era lo que dejaba filas fantasma imposibles de borrar).
  const resyncPartidas = useCallback(async () => {
    try {
      const updated = await fetchQuotationDetail(id)
      pendingRowRemovalsRef.current.clear()
      pendingRowCreationsRef.current.clear()
      applyCotizacionToState(updated)
    } catch (loadError) {
      console.error('[cotizaciones/[id]] Error resincronizando partidas:', loadError)
    }
  }, [applyCotizacionToState, id])

  /**
   * Reconciliación con el servidor: la ÚNICA garantía de que las dos pantallas
   * terminen viendo lo mismo. PostgreSQL es la única fuente de verdad -- esto lee de
   * la base a través de nuestro propio servidor (el que sí valida la sesión), nunca
   * de un dato que otro navegador haya empujado directamente.
   *
   * La dispara cada evento server-confirmed (`item_confirmed`/`general_confirmed`/
   * `totales_confirmed`/`notas_confirmed`, emitidos DESPUÉS de que Postgres commitea
   * -- ver `lib/server/realtime/broadcast.ts`), reconectar el canal, volver a la
   * pestaña, y un latido periódico como red de seguridad si algo de lo anterior se
   * pierde.
   *
   * Nada de esto pisa lo que el usuario está escribiendo: las celdas sucias, bajo el
   * cursor o con guardado en vuelo se conservan, y una respuesta que salió antes de
   * una escritura local pierde contra ella.
   *
   * Fase 6.7 pedía simplificar esta función una vez que IDs temporales y datos
   * empujados por otro navegador dejaran de existir -- eso ya pasó en Fase 6B (IDs
   * estables, sin `migrateRowKeys`) y 6D (`item_mutation` retirado), y esa era la
   * complejidad real que arrastraba. Lo que queda -- `celdaOcupada` (dirty/foco/
   * guardando), `escrituraLocalPosterior` (`localWriteAtRef`) y `conservarLocal`
   * (`pendingRowCreationsRef`) -- no es legacy: sigue siendo necesario para no
   * pisar una edición en curso o una fila cuya alta todavía no confirmó el
   * servidor. RHF/FieldArray tampoco decide verdad colaborativa aquí: solo pinta
   * lo que esta función ya reconcilió contra el servidor.
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
      for (const item of updated.items || []) recordServerItem(item)
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
        // Las filas cuya alta sigue en vuelo y las que se están borrando siguen
        // siendo del usuario.
        conservarLocal: (rowId) => pendingRowCreationsRef.current.has(rowId) || hasLocalItemRowActivity(rowId),
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
        // Cambió el conjunto de filas. `replace` remonta la tabla entera y le quita el
        // cursor a quien está escribiendo -- la molestia que este mismo módulo ya había
        // arreglado-, así que solo se usa como último recurso y conservando el foco.
        const idsLocales = locales.map((item) => item.id)
        const idsFusionadas = fusionadas.map((item) => item.id)
        const soloSeAgregaronAlFinal =
          fusionadas.length > locales.length &&
          idsLocales.every((idLocal, i) => idLocal === idsFusionadas[i])

        if (soloSeAgregaronAlFinal) {
          // Filas nuevas al final: se añaden sin tocar las demás, así que nadie pierde
          // el cursor ni lo que está escribiendo.
          append(fusionadas.slice(locales.length), { shouldFocus: false })
        } else {
          // Cualquier otro cambio del conjunto (filas que desaparecieron, reordenes) se
          // aplica reconstruyendo la lista y devolviendo el foco donde estaba.
          //
          // Se intentó quitarlas una a una con `remove` para no remontar la tabla, y
          // medido con el canal simulado NO funciona: la fila no se va, queda una fila
          // fantasma sin id -la misma clase de fallo que este módulo ya tuvo- y cada
          // reconciliación vuelve a intentarlo. `replace` sí la quita.
          const enfocado = typeof document !== 'undefined' ? (document.activeElement as HTMLInputElement | null) : null
          const nombreEnfocado = enfocado?.getAttribute('name') || null
          let seleccion: [number, number] | null = null
          try {
            if (nombreEnfocado && enfocado?.selectionStart !== null && enfocado?.selectionEnd !== null) {
              seleccion = [enfocado!.selectionStart as number, enfocado!.selectionEnd as number]
            }
          } catch {
            // Los input[type=number] no exponen selección en todos los navegadores.
          }

          replace(fusionadas)

          if (nombreEnfocado) {
            // React remonta los inputs en su propio ciclo, y no basta con enfocar una
            // vez: medido, el primer intento acierta sobre el input VIEJO -todavía
            // conectado- y el foco se pierde en cuanto React lo reemplaza. Se insiste
            // unos frames hasta que el foco quede en el input que de verdad quedó.
            let frames = 0
            const devolverFoco = () => {
              const destino = document.querySelector<HTMLInputElement>(`[name="${nombreEnfocado}"]`)
              if (destino?.isConnected && document.activeElement !== destino) {
                destino.focus()
                if (seleccion) {
                  try { destino.setSelectionRange(seleccion[0], seleccion[1]) } catch { /* ver arriba */ }
                }
              }
              if (frames++ < 12) window.requestAnimationFrame(devolverFoco)
            }
            window.requestAnimationFrame(devolverFoco)
          }
        }
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
  }, [append, applyGeneralOnly, applyNotasOnly, applyTotalsOnly, getValues, hasLocalItemRowActivity, id, recordServerItem, replace, setValue])

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
  const persistNotasAutosave = useCallback((): Promise<unknown> => {
    if (notasInFlightRef.current) return notasInFlightRef.current
    if (!cotizacion) return Promise.resolve()
    const notasToSave = getCurrentNotasSnapshot()
    const previousNotas = lastSavedNotasRef.current
    if (notasToSave === previousNotas) {
      notasDirtyRef.current = false
      if (!notasFocusedRef.current) { clearNotasIdleReleaseTimer(); notasLockHeldRef.current = false; releaseSection('notas') }
      else scheduleNotasIdleRelease()
      return Promise.resolve()
    }
    setIsSavingNotas(true)
    const p = trackMutation(saveQuotationNotes(id, notasToSave || null))
    notasInFlightRef.current = p
    p.then(
      () => {
        lastSavedNotasRef.current = notasToSave
        setCotizacion((prev) => (prev ? { ...prev, notas_internas: notasToSave || null } : prev))
        const hasPendingChanges = getCurrentNotasSnapshot() !== lastSavedNotasRef.current
        notasDirtyRef.current = hasPendingChanges
        if (!notasFocusedRef.current) { clearNotasIdleReleaseTimer(); notasLockHeldRef.current = false; releaseSection('notas'); return }
        if (!hasPendingChanges) scheduleNotasIdleRelease()
      },
      (saveError: unknown) => {
        setError(saveError instanceof Error ? saveError.message : 'Error guardando notas internas')
        notasDirtyRef.current = getCurrentNotasSnapshot() !== lastSavedNotasRef.current
        clearNotasIdleReleaseTimer()
        notasLockHeldRef.current = false
        releaseSection('notas')
      }
    ).finally(() => { setIsSavingNotas(false); notasInFlightRef.current = null })
    return p
  }, [clearNotasIdleReleaseTimer, cotizacion, getCurrentNotasSnapshot, id, releaseSection, scheduleNotasIdleRelease, trackMutation])

  const getGeneralFieldValue = useCallback((field: QuotationGeneralField): unknown => {
    switch (field) {
      case 'cliente': return clienteInputValueRef.current
      case 'proyecto': return proyectoInputValueRef.current
      case 'fecha_entrega': return getValues('fecha_entrega') || ''
      case 'locacion': return getValues('locacion') || ''
    }
  }, [getValues])

  const getTotalsFieldValue = useCallback((field: QuotationTotalsField): unknown => {
    switch (field) {
      case 'porcentaje_fee': return porcentajeFeeValueRef.current
      case 'iva_activo': return ivaActivoValueRef.current
      case 'descuento_tipo': return descuentoTipoValueRef.current
      case 'descuento_valor': return descuentoValorValueRef.current
    }
  }, [])

  /**
   * PATCH de UN SOLO campo de General, con su propio "base" y su propio conflicto.
   * Reemplaza el guardado de sección completa: antes, editar Fecha reenviaba
   * también Cliente/Proyecto/Locación tal cual estuvieran en pantalla en ese
   * instante, así que la edición de Locación de otro colaborador -- que ya había
   * sido confirmada por el servidor mientras el debounce de 800 ms de Fecha seguía
   * corriendo -- podía quedar pisada por ese PATCH. Con un campo por PATCH esto ya
   * no es posible: cada uno solo toca su propia columna.
   */
  // Fase 8.7 (Bloque 1): mismo cambio de forma que persistNotasAutosave --
  // devuelve `p` (la promesa trackeada de `patchQuotationGeneral`, que sí
  // rechaza en 409/500) y mueve el manejo de conflicto/error a
  // `.then(onFulfilled, onRejected)`. El resto de la lógica (base, snapshot,
  // liberación de sección) es idéntica a la de antes, solo movida de las
  // ramas try/catch a las del `.then`.
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
          // Igual que `sendItemCellPatchRound`: si ya hay un reintento
          // encolado (`generalFieldRetryNeededRef`), esta ronda que acaba de
          // resolver ya está desactualizada frente a una edición más nueva --
          // limpiar el dirty acá dejaría creer que el campo ya no tiene
          // cambios locales sin confirmar. El drenado de
          // `persistGeneralFieldAutosave` manda la ronda siguiente con el
          // valor correcto -- recién esa, al no encontrar más reintentos
          // pendientes, limpia el dirty de verdad.
          if (!generalFieldRetryNeededRef.current.has(field)) {
            generalFieldDirtyRef.current.delete(field)
          }
          clearGeneralFieldConflict(field)
          if (updated) {
            generalServerRef.current = buildGeneralSnapshot({ cliente: updated.cliente, proyecto: updated.proyecto, fecha_entrega: updated.fecha_entrega || '', locacion: updated.locacion || '' })
            // Causa E (portada de partidas): refrescar el "base" al valor
            // recién confirmado, SIEMPRE -- no solo cuando el dirty se limpia.
            // Sin esto, una ronda encolada por `generalFieldRetryNeededRef`
            // mandaría su PATCH con el `base` de ANTES de esta ronda exitosa,
            // que ya quedó viejo frente al valor real en el servidor, y
            // produciría un 409 contra uno mismo -- el mismo conflicto falso
            // que este fix busca eliminar.
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
            // Si lo que se intentó guardar es idéntico a lo que el servidor ya tiene,
            // no hay nada que decidir -- se resuelve solo, sin mostrar el banner.
            const detail = saveError.fields[field]
            if (detail && normalizeGeneralFieldValue(detail.attempted) === normalizeGeneralFieldValue(detail.current)) {
              generalServerRef.current = { ...generalServerRef.current, [field]: detail.current } as GeneralSnapshot
              generalFieldBaseRef.current[field] = detail.current
              // Mismo motivo que la rama de éxito: no limpiar dirty si ya hay
              // un reintento encolado con un valor más nuevo.
              if (!generalFieldRetryNeededRef.current.has(field)) {
                generalFieldDirtyRef.current.delete(field)
              }
              generalDirtyRef.current = generalFieldDirtyRef.current.size > 0
              return
            }
            // Nunca se descarta en silencio lo que el usuario tecleó: el campo queda
            // tal cual, se muestra el conflicto y el usuario decide con qué valor
            // seguir. Se relanza para que la promesa trackeada rechace de verdad y
            // `flushPendingSaves` vea la falla real (conflicto sin resolver).
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
  }, [clearGeneralFieldConflict, clearGeneralIdleReleaseTimer, cotizacion, getGeneralFieldValue, patchQuotationGeneral, releaseSection, scheduleGeneralIdleRelease, trackMutation])

  const sendTotalsFieldPatchRound = useCallback((field: QuotationTotalsField): Promise<unknown> => {
    if (!cotizacion) return Promise.resolve()
    totalsFieldSavingRef.current.add(field)
    setIsSavingTotals(true)
    const value = getTotalsFieldValue(field)
    const patch: Record<string, unknown> = { [field]: value }
    const baseValue = totalsFieldBaseRef.current[field]
    const base = baseValue !== undefined ? { [field]: baseValue } : undefined
    // Mismo motivo que `sendGeneralFieldPatchRound`: `trackMutation` debe
    // registrar la promesa SEMÁNTICA (tras resolver un conflicto idéntico), no
    // la cruda.
    const rawPatch = patchQuotationTotales(patch, { base })
    const semantic = rawPatch.then(
      (updated) => {
        try {
          // Mismo motivo que `sendGeneralFieldPatchRound`: no limpiar dirty si
          // ya hay un reintento encolado (`totalsFieldRetryNeededRef`) con un
          // valor más nuevo -- el drenado de `persistTotalsFieldAutosave`
          // manda la ronda siguiente y recién esa limpia el dirty de verdad.
          if (!totalsFieldRetryNeededRef.current.has(field)) {
            totalsFieldDirtyRef.current.delete(field)
          }
          clearTotalsFieldConflict(field)
          if (updated) {
            totalsServerRef.current = buildTotalsSnapshot({ porcentaje_fee: updated.porcentaje_fee, iva_activo: updated.iva_activo, descuento_tipo: updated.descuento_tipo, descuento_valor: updated.descuento_valor })
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
            // Si lo que se intentó guardar es idéntico a lo que el servidor ya tiene,
            // no hay nada que decidir -- se resuelve solo, sin mostrar el banner.
            const detail = saveError.fields[field]
            if (detail && normalizeTotalsFieldValue(field, detail.attempted) === normalizeTotalsFieldValue(field, detail.current)) {
              totalsServerRef.current = { ...totalsServerRef.current, [field]: detail.current } as TotalsSnapshot
              totalsFieldBaseRef.current[field] = detail.current
              // Mismo motivo que la rama de éxito: no limpiar dirty si ya hay
              // un reintento encolado con un valor más nuevo.
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
  }, [clearTotalsFieldConflict, clearTotalsIdleReleaseTimer, cotizacion, getTotalsFieldValue, patchQuotationTotales, releaseSection, scheduleTotalsIdleRelease, trackMutation])

  /**
   * Drenado real para General (mismo patrón que `persistItemCellAutosave`
   * para partidas): como máximo una ronda de PATCH en vuelo por campo. Si
   * llega una edición nueva mientras una ronda ya está en curso, no dispara
   * un segundo `fetch` en paralelo -- marca `generalFieldRetryNeededRef` y el
   * `do...while` manda una ronda más en cuanto la actual resuelve, con el
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
    // Mismo motivo que `persistItemCellAutosave`: este drenado se dispara
    // "fire and forget" desde un debounce -- sin este `catch` mudo, un
    // conflicto real (que a propósito rechaza el drenado) se reportaría como
    // unhandled rejection aunque el banner de conflicto ya se haya mostrado.
    drain.catch(() => {})
    generalFieldDrainRef.current.set(field, drain)
    return drain
  }, [sendGeneralFieldPatchRound])

  /** Equivalente a `persistGeneralFieldAutosave`, para Totales. */
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

  const persistGeneralFieldRef = useRef(persistGeneralFieldAutosave)
  persistGeneralFieldRef.current = persistGeneralFieldAutosave
  const persistTotalsFieldRef = useRef(persistTotalsFieldAutosave)
  persistTotalsFieldRef.current = persistTotalsFieldAutosave

  /**
   * Marca un campo de General como sucio y programa su propio autoguardado
   * debounced -- mismo patrón que `handleItemFieldChange` para celdas de
   * partidas, pero sin necesitar wiring por-input en el componente hijo: el
   * "base" se captura la PRIMERA vez que el campo se ensucia desde el último
   * valor confirmado por el servidor (`generalServerRef`), no en un focus
   * separado, porque `QuotationGeneralInfoSection` solo expone focus/blur a
   * nivel de sección.
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

  const markTotalsFieldDirty = useCallback((field: QuotationTotalsField) => {
    if (!totalsFieldDirtyRef.current.has(field)) {
      totalsFieldBaseRef.current[field] = totalsServerRef.current[field]
      totalsFieldDirtyRef.current.add(field)
    }
    totalsDirtyRef.current = true
    clearTotalsFieldTimer(field)
    totalsFieldTimersRef.current[field] = window.setTimeout(() => { void persistTotalsFieldRef.current(field) }, TOTALS_AUTOSAVE_DELAY_MS)
  }, [clearTotalsFieldTimer])

  // Al salir de la sección se guardan de inmediato todos los campos sucios en vez
  // de esperar su debounce individual -- mismo criterio que tenía el guardado de
  // sección completa al perder el foco.
  // Fase 8.7 (Bloque 1): un campo "sucio" sigue contando como tal hasta que su
  // PATCH resuelve con éxito (`sendGeneralFieldPatchRound` recién lo borra de
  // `generalFieldDirtyRef` en el `.then` de éxito) -- así que si esto se
  // dispara mientras ESE MISMO campo ya tiene un PATCH en vuelo (p. ej. el
  // blur de la sección, disparado por el propio click en Aprobar/Generar, que
  // corre en un `setTimeout(0)` diferido y puede caer después de que
  // `flushPendingSaves` ya lo disparó), saltarlo evita un segundo PATCH
  // concurrente del mismo campo -- que además de redundante, puede generar un
  // 409 falso contra sí mismo (el `base` que manda el segundo ya quedó viejo
  // frente al valor que el primero acaba de confirmar). El primero ya quedó
  // trackeado en `pendingMutationsRef` vía `trackMutation`, así que
  // `flushPendingSaves` lo sigue esperando aunque aquí no se repita.
  // Fase 8.7.2 (causa F, portado a General): itera la UNIÓN de
  // `generalFieldDirtyRef` y `generalFieldDrainRef.keys()`, no solo dirty --
  // así un drenado ya en curso se ve aunque su ronda actual haya limpiado
  // `generalFieldDirtyRef` un instante antes de que esto corra. Si ya hay un
  // drenado en vuelo para el campo, se reusa esa misma promesa en vez de
  // disparar una ronda nueva por su cuenta.
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

  const resolveGeneralFieldConflict = useCallback((field: QuotationGeneralField, resolution: 'theirs' | 'mine') => {
    const detail = generalFieldConflicts[field]
    if (!detail) return
    clearGeneralFieldConflict(field)
    // El "current" que devolvió la RPC es la verdad del servidor a partir de ahora,
    // gane el valor ajeno o el propio -- ambos casos parten de ahí para el próximo PATCH.
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
    // corregido -- reusa el drenado genérico (mismo criterio que
    // `resolveItemCellConflict` con `persistItemCellAutosave`) en vez de
    // llamar la ronda cruda directo, para que un reintento concurrente sobre
    // este mismo campo se encole en vez de correr en paralelo.
    void persistGeneralFieldAutosave(field)
  }, [clearGeneralFieldConflict, generalFieldConflicts, persistGeneralFieldAutosave, setClienteInput, setProyectoInput, setValue])

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
  }, [flushGeneralDirtyFields, flushTotalsDirtyFields, flushItemCellDirtyFields, itemCellConflicts, persistNotasAutosave])

  useEffect(() => {
    if (!esEditable || !notasLockHeldRef.current || !notasDirtyRef.current || isSavingNotas) return
    if (notasAutosaveTimerRef.current !== null) window.clearTimeout(notasAutosaveTimerRef.current)
    notasAutosaveTimerRef.current = window.setTimeout(() => { void persistNotasAutosave() }, NOTAS_AUTOSAVE_DELAY_MS)
    return () => { if (notasAutosaveTimerRef.current !== null) { window.clearTimeout(notasAutosaveTimerRef.current); notasAutosaveTimerRef.current = null } }
  }, [esEditable, isSavingNotas, notasInternas, persistNotasAutosave])

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
    if (notasAutosaveTimerRef.current !== null) window.clearTimeout(notasAutosaveTimerRef.current)
    clearNotasIdleReleaseTimer(); clearGeneralIdleReleaseTimer(); clearTotalsIdleReleaseTimer()
    Object.values(itemCellAutosaveTimersRef.current).forEach((timer) => timer && window.clearTimeout(timer))
    Object.values(itemCellIdleReleaseTimersRef.current).forEach((timer) => timer && window.clearTimeout(timer))
    Object.values(generalFieldTimersRef.current).forEach((timer) => timer && window.clearTimeout(timer))
    Object.values(totalsFieldTimersRef.current).forEach((timer) => timer && window.clearTimeout(timer))
  }, [clearGeneralIdleReleaseTimer, clearNotasIdleReleaseTimer, clearTotalsIdleReleaseTimer])

  const handleNotasFocus = useCallback(() => { if (!esEditable) return; clearNotasIdleReleaseTimer(); notasFocusedRef.current = true; if (!notasLockHeldRef.current) { notasLockHeldRef.current = true; setActiveSection('notas') } }, [clearNotasIdleReleaseTimer, esEditable, setActiveSection])
  const handleGeneralFocus = useCallback(() => { if (!esEditable) return; clearGeneralIdleReleaseTimer(); generalFocusedRef.current = true; if (!generalLockHeldRef.current) { generalLockHeldRef.current = true; setActiveSection('general') } }, [clearGeneralIdleReleaseTimer, esEditable, setActiveSection])
  const handleTotalsFocus = useCallback(() => { if (!esEditable) return; clearTotalsIdleReleaseTimer(); totalsFocusedRef.current = true; if (!totalsLockHeldRef.current) { totalsLockHeldRef.current = true; setActiveSection('totales') } }, [clearTotalsIdleReleaseTimer, esEditable, setActiveSection])

  const handleNotasBlur = useCallback((event: FocusEvent<HTMLDivElement>) => { if (!esEditable) return; const nextTarget = event.relatedTarget as Node | null; if (nextTarget && notasSectionRef.current?.contains(nextTarget)) return; window.setTimeout(() => { const activeElement = document.activeElement; if (activeElement && notasSectionRef.current?.contains(activeElement)) return; notasFocusedRef.current = false; clearNotasIdleReleaseTimer(); if (notasDirtyRef.current) { void persistNotasAutosave(); return } notasLockHeldRef.current = false; releaseSection('notas') }, 0) }, [clearNotasIdleReleaseTimer, esEditable, persistNotasAutosave, releaseSection])
  const handleGeneralBlur = useCallback((event: FocusEvent<HTMLDivElement>) => { if (!esEditable) return; const nextTarget = event.relatedTarget as Node | null; if (nextTarget && generalSectionRef.current?.contains(nextTarget)) return; window.setTimeout(() => { const activeElement = document.activeElement; if (activeElement && generalSectionRef.current?.contains(activeElement)) return; generalFocusedRef.current = false; clearGeneralIdleReleaseTimer(); if (generalFieldDirtyRef.current.size > 0) { flushGeneralDirtyFields(); return } generalLockHeldRef.current = false; releaseSection('general') }, 0) }, [clearGeneralIdleReleaseTimer, esEditable, flushGeneralDirtyFields, releaseSection])
  const handleTotalsBlur = useCallback((event: FocusEvent<HTMLDivElement>) => { if (!esEditable) return; const nextTarget = event.relatedTarget as Node | null; if (nextTarget && totalsSectionRef.current?.contains(nextTarget)) return; window.setTimeout(() => { const activeElement = document.activeElement; if (activeElement && totalsSectionRef.current?.contains(activeElement)) return; totalsFocusedRef.current = false; clearTotalsIdleReleaseTimer(); if (totalsFieldDirtyRef.current.size > 0) { flushTotalsDirtyFields(); return } totalsLockHeldRef.current = false; releaseSection('totales') }, 0) }, [clearTotalsIdleReleaseTimer, esEditable, flushTotalsDirtyFields, releaseSection])

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

  const trackedHandleClienteChange = useCallback((value: string) => { handleGeneralFocus(); markGeneralFieldDirty('cliente'); handleClienteChange(value) }, [handleClienteChange, handleGeneralFocus, markGeneralFieldDirty])
  const trackedHandleProyectoChange = useCallback((value: string) => { handleGeneralFocus(); markGeneralFieldDirty('proyecto'); handleProyectoChange(value) }, [handleGeneralFocus, handleProyectoChange, markGeneralFieldDirty])
  const trackedSelectCliente = useCallback((value: string) => { handleGeneralFocus(); markGeneralFieldDirty('cliente'); seleccionarCliente(value) }, [handleGeneralFocus, markGeneralFieldDirty, seleccionarCliente])
  const trackedSelectProyecto = useCallback((value: string) => { handleGeneralFocus(); markGeneralFieldDirty('proyecto'); seleccionarProyecto(value) }, [handleGeneralFocus, markGeneralFieldDirty, seleccionarProyecto])
  const trackedHandleFechaEntregaChange = useCallback(() => { handleGeneralFocus(); markGeneralFieldDirty('fecha_entrega') }, [handleGeneralFocus, markGeneralFieldDirty])
  const trackedHandleLocacionChange = useCallback(() => { handleGeneralFocus(); markGeneralFieldDirty('locacion') }, [handleGeneralFocus, markGeneralFieldDirty])
  const trackedSetPorcentajeFee = useCallback((value: number) => { handleTotalsFocus(); markTotalsFieldDirty('porcentaje_fee'); porcentajeFeeValueRef.current = value; setPorcentajeFee(value) }, [handleTotalsFocus, markTotalsFieldDirty])
  const trackedSetIvaActivo = useCallback((value: boolean | ((prev: boolean) => boolean)) => { handleTotalsFocus(); markTotalsFieldDirty('iva_activo'); const nextValue = typeof value === 'function' ? value(ivaActivoValueRef.current) : value; ivaActivoValueRef.current = nextValue; setIvaActivo(nextValue) }, [handleTotalsFocus, markTotalsFieldDirty])
  const trackedSetDescuentoTipo = useCallback((value: 'monto' | 'porcentaje') => { handleTotalsFocus(); markTotalsFieldDirty('descuento_tipo'); descuentoTipoValueRef.current = value; setDescuentoTipo(value) }, [handleTotalsFocus, markTotalsFieldDirty])
  const trackedSetDescuentoValor = useCallback((value: number) => { handleTotalsFocus(); markTotalsFieldDirty('descuento_valor'); descuentoValorValueRef.current = value; setDescuentoValor(value) }, [handleTotalsFocus, markTotalsFieldDirty])

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
    try {
      // Las filas en blanco que ya existen se reutilizan (conservan su posición) y las
      // que sobren se borran en la misma petición.
      const reemplazarIds = (getValues('items') || [])
        .filter((item) => isBlankQuotationItem(item))
        .map((item) => item.id)
        .filter((rowId): rowId is string => !!rowId && !pendingRowCreationsRef.current.has(rowId))

      // Fase 8.7.1: se trackea la operación completa (fetch + parseo + chequeo
      // de status, no el `fetch()` crudo) -- mismo criterio que
      // `patchQuotationItem` -- para que `flushPendingSaves` espere una
      // importación en vuelo antes de Generar/Aprobar y aborte si falla.
      const data = await trackMutation((async () => {
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
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body?.message || body?.error || 'Error copiando partidas')
        return body
      })())

      const updated = data?.cotizacion as Cotizacion | undefined
      if (!updated) throw new Error('Respuesta inválida al copiar partidas')

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

      {(notasInternas || esEditable) && <div ref={notasSectionRef} className={`bg-row/60 border rounded-panel p-4 ${sectionEditors.notas ? 'border-accent-quiet/70' : 'border-hairline'}`} onFocusCapture={handleNotasFocus} onBlurCapture={handleNotasBlur}><SectionEditBadge section="notas" /><p className="sn-label mb-2">Notas del evento (uso interno)</p>{esEditable ? <textarea value={notasInternas} onChange={e => { handleNotasFocus(); notasDirtyRef.current = true; setNotasInternas(e.target.value) }} rows={3} placeholder="Sin notas..." className="w-full bg-transparent text-body text-content resize-none outline-none placeholder-faint disabled:opacity-50 disabled:cursor-not-allowed" /> : <p className="text-subtext text-content whitespace-pre-wrap">{notasInternas || '—'}</p>}</div>}

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
