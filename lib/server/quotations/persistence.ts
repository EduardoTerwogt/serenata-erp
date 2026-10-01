import { getCotizacionById, EstadoCotizacionInvalidoError } from '@/lib/db'
import { buildPersistedQuotationItems, buildQuotationPersistenceData } from '@/lib/quotations/mappers'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { ItemCotizacion } from '@/lib/types'

async function saveCotizacionAtomic(payload: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc('save_cotizacion', { p_data: payload })
  if (error) throw error
  // L1: guardar solo aplica a BORRADOR/EMITIDA; el estado cambia solo por RPC.
  if (data && typeof data === 'object' && 'estado_invalido' in data) {
    throw new EstadoCotizacionInvalidoError((data as { estado_actual?: string | null }).estado_actual ?? null)
  }
}

/**
 * Resuelve (o crea) el cliente por nombre en UN viaje (`resolver_cliente`:
 * upsert por `nombre_clave`, sin carrera y sin renombrar al existente).
 * Se llama ANTES de guardar la cotización para que el `cliente_id` viaje dentro
 * del payload de la RPC de guardado y no haga falta un UPDATE posterior fuera
 * del modelo de conflictos (PLAN.md, K5).
 */
export async function resolverClienteId(clienteValue: unknown): Promise<string | null> {
  const nombre = String(clienteValue ?? '').trim()
  if (!nombre) return null
  const { data, error } = await supabaseAdmin.rpc('resolver_cliente', { p_nombre: nombre })
  if (error) throw error
  return (data as string | null) ?? null
}

/**
 * Autosave del catálogo de productos: un solo upsert en bloque, deduplicado por
 * descripción (la última partida gana). Los errores se registran, no se lanzan
 * (el guardado de la cotización ya ocurrió); se llama dentro de `after()`.
 */
export async function autosaveProductosCatalogo(items: Partial<ItemCotizacion>[], source: string) {
  const porDescripcion = new Map<string, Record<string, unknown>>()
  for (const item of items) {
    const descripcion = String(item.descripcion || '').trim()
    if (!descripcion) continue
    porDescripcion.set(descripcion, {
      descripcion,
      categoria: String(item.categoria || '').trim() || null,
      precio_unitario: item.precio_unitario ?? 0,
      costo_unitario_sugerido: item.costo_unitario ?? 0,
      activo: true,
    })
  }
  if (porDescripcion.size === 0) return

  const { error } = await supabaseAdmin
    .from('productos')
    .upsert(Array.from(porDescripcion.values()), { onConflict: 'descripcion' })
  if (error) console.warn(`[${source}] Autosave de productos falló:`, error)
}

export async function createOrReplaceCotizacion(payload: Record<string, unknown>) {
  await saveCotizacionAtomic(payload)
}

/**
 * Bloque 2 (docs/PLAN.md) sub-tarea 6: `notas_pdf` es un campo nuevo,
 * distinto de `notas_internas` -- comparte el mismo pop-up ("Nota de
 * evento") y el mismo autosave de sección, así que ambos valores se
 * guardan juntos en un solo UPDATE en vez de duplicar por completo el
 * mecanismo de dirty/debounce de `useQuotationNotasAutosave` para un
 * segundo campo de texto sin conflicto multi-usuario real (T7).
 *
 * Ambos campos son opcionales para que POST/PUT de cotizaciones puedan
 * mandar solo el que trae el body sin pisar el otro a `null` -- ver
 * `docs/PLAN.md` corrección: la pantalla de "Nueva Cotización" no tenía
 * forma de guardar `notas_pdf` porque las rutas de creación/edición solo
 * conocían `notas_internas`.
 */
export async function saveNotas(id: string, notas: { notas_internas?: string | null; notas_pdf?: string | null }) {
  const update: Record<string, string | null> = {}
  if (notas.notas_internas !== undefined) update.notas_internas = notas.notas_internas
  if (notas.notas_pdf !== undefined) update.notas_pdf = notas.notas_pdf
  if (Object.keys(update).length === 0) return

  const { error } = await supabaseAdmin
    .from('cotizaciones')
    .update(update)
    .eq('id', id)
  if (error) throw error
}

/**
 * Recalcula el encabezado DENTRO de la base, en una sentencia.
 *
 * Antes se leía la cotización, se calculaban los totales en JS y se escribían de
 * vuelta: dos guardados simultáneos podían leer ambos la misma foto y dejar el
 * encabezado sin uno de los cambios. Las fórmulas de la RPC son las mismas de
 * lib/quotations/calculations.ts (ver la migración, que las documenta).
 */
export async function recalculateQuotationHeader(cotizacionId: string) {
  const { error } = await supabaseAdmin.rpc('recalcular_totales_cotizacion', { p_cotizacion_id: cotizacionId })
  if (error) throw error
  return getCotizacionById(cotizacionId)
}

export async function buildCreateCotizacionPayload(
  cotizacionData: Record<string, unknown>,
  inputItems: Partial<ItemCotizacion>[],
  options: {
    porcentaje_fee?: number
    iva_activo?: boolean
    descuento_tipo?: 'monto' | 'porcentaje'
    descuento_valor?: number
    forcedFolio?: string
    preventOverwrite?: boolean
  }
) {
  const folio = String(options.forcedFolio || cotizacionData.id || '').trim()
  if (!folio) throw new Error('No se pudo resolver un folio para la cotización')

  const cotizacionActual = await getCotizacionById(folio).catch(() => null)

  if (cotizacionActual && options.preventOverwrite) {
    throw new Error('Ya existe una cotización con el folio reservado. Recarga la página e inténtalo de nuevo.')
  }

  const previousItems = cotizacionActual?.items || []
  const fechaCotizacion = cotizacionActual?.fecha_cotizacion || new Date().toISOString().split('T')[0]

  const persistenceData = buildQuotationPersistenceData(
    inputItems,
    options.porcentaje_fee ?? cotizacionActual?.porcentaje_fee ?? 0.15,
    options.iva_activo ?? cotizacionActual?.iva_activo ?? true,
    options.descuento_tipo ?? cotizacionActual?.descuento_tipo ?? 'monto',
    options.descuento_valor ?? cotizacionActual?.descuento_valor ?? 0
  )

  const itemsPayload = buildPersistedQuotationItems(
    folio,
    inputItems,
    cotizacionActual
      ? {
          previousItems,
          preservePreviousResponsables: true,
          preservePreviousNotas: true,
        }
      : undefined
  )

  const payload = {
    id: folio,
    cliente: cotizacionData.cliente,
    cliente_id: cotizacionData.cliente_id ?? cotizacionActual?.cliente_id ?? null,
    proyecto: cotizacionData.proyecto,
    fecha_entrega: cotizacionData.fecha_entrega,
    locacion: cotizacionData.locacion,
    fecha_cotizacion: fechaCotizacion,
    tipo: cotizacionData.tipo ?? cotizacionActual?.tipo ?? 'PRINCIPAL',
    es_complementaria_de: cotizacionData.es_complementaria_de ?? cotizacionActual?.es_complementaria_de ?? null,
    ...persistenceData,
    items: itemsPayload,
  }

  return {
    folio,
    payload,
    wasExisting: !!cotizacionActual,
  }
}

export async function buildUpdateCotizacionPayload(
  id: string,
  previousCotizacion: {
    cliente: string
    cliente_id?: string | null
    proyecto: string
    fecha_entrega: string | null
    locacion: string | null
    fecha_cotizacion: string | null
    tipo?: string | null
    es_complementaria_de?: string | null
    porcentaje_fee?: number | null
    iva_activo?: boolean | null
    descuento_tipo?: 'monto' | 'porcentaje' | null
    descuento_valor?: number | null
    items?: ItemCotizacion[]
  },
  cotizacionData: Record<string, unknown>,
  inputItems: Partial<ItemCotizacion>[] | null,
  options: {
    porcentaje_fee?: number
    iva_activo?: boolean
    descuento_tipo?: 'monto' | 'porcentaje'
    descuento_valor?: number
  }
) {
  const previousItems = previousCotizacion.items || []

  const resolvedPorcentajeFee = options.porcentaje_fee ?? previousCotizacion.porcentaje_fee ?? 0.15
  const resolvedIvaActivo = options.iva_activo ?? previousCotizacion.iva_activo ?? true
  const resolvedDescuentoTipo = options.descuento_tipo ?? previousCotizacion.descuento_tipo ?? 'monto'
  const resolvedDescuentoValor = options.descuento_valor ?? previousCotizacion.descuento_valor ?? 0

  const sourceItemsForTotals = inputItems ?? previousItems
  const persistenceData = buildQuotationPersistenceData(
    sourceItemsForTotals,
    resolvedPorcentajeFee,
    resolvedIvaActivo,
    resolvedDescuentoTipo,
    resolvedDescuentoValor
  )

  const itemsPayload = inputItems !== null
    ? buildPersistedQuotationItems(id, inputItems, {
        previousItems,
        preservePreviousResponsables: true,
        preservePreviousNotas: true,
      })
    : buildPersistedQuotationItems(id, previousItems, {
        previousItems,
        preservePreviousResponsables: true,
        preservePreviousNotas: true,
      })

  return {
    id,
    cliente: cotizacionData.cliente ?? previousCotizacion.cliente,
    cliente_id: cotizacionData.cliente_id ?? previousCotizacion.cliente_id ?? null,
    proyecto: cotizacionData.proyecto ?? previousCotizacion.proyecto,
    fecha_entrega: cotizacionData.fecha_entrega ?? previousCotizacion.fecha_entrega,
    locacion: cotizacionData.locacion ?? previousCotizacion.locacion,
    fecha_cotizacion: previousCotizacion.fecha_cotizacion,
    tipo: cotizacionData.tipo ?? previousCotizacion.tipo ?? 'PRINCIPAL',
    es_complementaria_de: cotizacionData.es_complementaria_de ?? previousCotizacion.es_complementaria_de ?? null,
    ...persistenceData,
    items: itemsPayload,
  }
}
