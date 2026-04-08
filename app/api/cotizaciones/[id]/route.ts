import { requireSection } from '@/lib/api-auth'
import {
  deleteCotizacion,
  deleteItemsByCotizacion,
  getCotizacionById,
} from '@/lib/db'
import { ItemCotizacion } from '@/lib/types'
import { supabaseAdmin } from '@/lib/supabase'
import { buildPersistedQuotationItems, buildQuotationPersistenceData } from '@/lib/quotations/mappers'
import { formatSupabaseError } from '@/lib/quotations/rpc-utils'
import { CotizacionUpdateSchema, validate } from '@/lib/validation/schemas'

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

async function runNonCriticalAutosaves(
  clienteValue: unknown,
  proyectoValue: unknown,
  items: Partial<ItemCotizacion>[]
) {
  const tasks: Promise<unknown>[] = [autosaveClienteYProyecto(clienteValue, proyectoValue)]

  if (items.length > 0) {
    tasks.push(autosaveProductos(items))
  }

  const results = await Promise.allSettled(tasks)

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const label = index === 0 ? 'cliente/proyecto' : 'productos'
      console.warn(`[PUT /api/cotizaciones/:id] Autosave no crítico falló (${label}):`, result.reason)
    }
  })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const cotizacion = await getCotizacionById(id)
    return Response.json(cotizacion)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Cotización no encontrada' }, { status: 404 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const previousCotizacion = await getCotizacionById(id)
    const previousItems = previousCotizacion.items || []

    const body = await request.json()

    const validation = validate(CotizacionUpdateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const { items, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor, ...cotizacionData } = body
    const inputItems = Array.isArray(items) ? (items as Partial<ItemCotizacion>[]) : null

    const resolvedPorcentajeFee = porcentaje_fee ?? previousCotizacion.porcentaje_fee ?? 0.15
    const resolvedIvaActivo = iva_activo ?? previousCotizacion.iva_activo ?? true
    const resolvedDescuentoTipo = descuento_tipo ?? previousCotizacion.descuento_tipo ?? 'monto'
    const resolvedDescuentoValor = descuento_valor ?? previousCotizacion.descuento_valor ?? 0

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

    const payload = {
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

    await saveCotizacionAtomic(payload)
    await runNonCriticalAutosaves(
      payload.cliente,
      payload.proyecto,
      inputItems ?? []
    )

    return Response.json(await getCotizacionById(id))
  } catch (error) {
    console.error('[PUT /api/cotizaciones/:id] Error actualizando cotización:', formatSupabaseError(error))
    return Response.json({ error: 'Error actualizando cotización' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    await deleteItemsByCotizacion(id)
    await deleteCotizacion(id)
    return Response.json({ ok: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error eliminando cotización' }, { status: 500 })
  }
}
