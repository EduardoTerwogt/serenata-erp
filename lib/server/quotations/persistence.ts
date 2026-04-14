import { getCotizacionById } from '@/lib/db'
import { buildPersistedQuotationItems, buildQuotationPersistenceData } from '@/lib/quotations/mappers'
import { supabaseAdmin } from '@/lib/supabase'
import { ItemCotizacion } from '@/lib/types'

async function saveCotizacionAtomic(payload: Record<string, unknown>) {
  const { error } = await supabaseAdmin.rpc('save_cotizacion', { p_data: payload })
  if (error) throw error
}

async function autosaveClienteYProyecto(clienteValue: unknown, proyectoValue: unknown) {
  const cliente = String(clienteValue || '').trim()
  const proyecto = String(proyectoValue || '').trim()

  if (!cliente) return

  const { data: clienteExistente, error: clienteFetchError } = await supabaseAdmin
    .from('clientes')
    .select('id, proyectos')
    .eq('nombre', cliente)
    .maybeSingle()

  if (clienteFetchError) throw clienteFetchError

  if (clienteExistente) {
    const proyectosActuales = Array.isArray(clienteExistente.proyectos) ? clienteExistente.proyectos : []
    const proyectos = proyecto && !proyectosActuales.includes(proyecto)
      ? [...proyectosActuales, proyecto]
      : proyectosActuales

    const { error: updateError } = await supabaseAdmin
      .from('clientes')
      .update({ proyectos, activo: true })
      .eq('id', clienteExistente.id)

    if (updateError) throw updateError
    return
  }

  const { error: insertError } = await supabaseAdmin
    .from('clientes')
    .insert({
      nombre: cliente,
      proyectos: proyecto ? [proyecto] : [],
      activo: true,
    })

  if (insertError) throw insertError
}

async function autosaveProductos(items: Partial<ItemCotizacion>[]) {
  for (const item of items) {
    const descripcion = String(item.descripcion || '').trim()
    if (!descripcion) continue

    const { error } = await supabaseAdmin
      .from('productos')
      .upsert({
        descripcion,
        categoria: String(item.categoria || '').trim() || null,
        precio_unitario: item.precio_unitario ?? 0,
        x_pagar_sugerido: item.x_pagar ?? 0,
        activo: true,
      }, { onConflict: 'descripcion' })

    if (error) throw error
  }
}

export async function runQuotationNonCriticalAutosaves(
  clienteValue: unknown,
  proyectoValue: unknown,
  items: Partial<ItemCotizacion>[],
  source: 'POST /api/cotizaciones' | 'PUT /api/cotizaciones/:id' | 'PATCH /api/cotizaciones/:id/general' | 'PATCH /api/cotizaciones/:id/totales'
) {
  const tasks: Promise<unknown>[] = [autosaveClienteYProyecto(clienteValue, proyectoValue)]

  if (items.length > 0) {
    tasks.push(autosaveProductos(items))
  }

  const results = await Promise.allSettled(tasks)

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const label = index === 0 ? 'cliente/proyecto' : 'productos'
      console.warn(`[${source}] Autosave no crítico falló (${label}):`, result.reason)
    }
  })
}

export async function createOrReplaceCotizacion(payload: Record<string, unknown>) {
  await saveCotizacionAtomic(payload)
}

export async function saveNotasInternas(id: string, notas: string | null) {
  const { error } = await supabaseAdmin
    .from('cotizaciones')
    .update({ notas_internas: notas })
    .eq('id', id)
  if (error) throw error
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
    proyecto: cotizacionData.proyecto,
    fecha_entrega: cotizacionData.fecha_entrega,
    locacion: cotizacionData.locacion,
    fecha_cotizacion: fechaCotizacion,
    tipo: cotizacionData.tipo ?? cotizacionActual?.tipo ?? 'PRINCIPAL',
    es_complementaria_de: cotizacionData.es_complementaria_de ?? cotizacionActual?.es_complementaria_de ?? null,
    estado: cotizacionData.estado ?? cotizacionActual?.estado ?? 'BORRADOR',
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
    proyecto: string
    fecha_entrega: string | null
    locacion: string | null
    fecha_cotizacion: string | null
    tipo?: string | null
    es_complementaria_de?: string | null
    estado?: string | null
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
    proyecto: cotizacionData.proyecto ?? previousCotizacion.proyecto,
    fecha_entrega: cotizacionData.fecha_entrega ?? previousCotizacion.fecha_entrega,
    locacion: cotizacionData.locacion ?? previousCotizacion.locacion,
    fecha_cotizacion: previousCotizacion.fecha_cotizacion,
    tipo: cotizacionData.tipo ?? previousCotizacion.tipo ?? 'PRINCIPAL',
    es_complementaria_de: cotizacionData.es_complementaria_de ?? previousCotizacion.es_complementaria_de ?? null,
    estado: cotizacionData.estado ?? previousCotizacion.estado ?? 'BORRADOR',
    ...persistenceData,
    items: itemsPayload,
  }
}
