import {
  getCotizacionById,
  getNextFolio,
  getNextFolioComplementaria,
} from '@/lib/db'
import { ItemCotizacion } from '@/lib/types'
import { supabaseAdmin } from '@/lib/supabase'
import { buildPersistedQuotationItems, buildQuotationPersistenceData } from '@/lib/quotations/mappers'
import { formatSupabaseError } from '@/lib/quotations/rpc-utils'
import { CotizacionCreateSchema, validate } from '@/lib/validation/schemas'

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
      console.warn(`[POST /api/cotizaciones] Autosave no crítico falló (${label}):`, result.reason)
    }
  })
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('cotizaciones')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return Response.json(data)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo cotizaciones' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const validation = validate(CotizacionCreateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const { items, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor, ...cotizacionData } = body
    const inputItems = Array.isArray(items) ? (items as Partial<ItemCotizacion>[]) : []

    const requestedId = String(cotizacionData.id || '').trim()
    const complementariaDe = String(cotizacionData.es_complementaria_de || '').trim()
    const folio: string = complementariaDe
      ? await getNextFolioComplementaria(complementariaDe)
      : requestedId || await getNextFolio()

    const cotizacionActual = await getCotizacionById(folio).catch(() => null)
    const previousItems = cotizacionActual?.items || []
    const fechaCotizacion = cotizacionActual?.fecha_cotizacion || new Date().toISOString().split('T')[0]

    const persistenceData = buildQuotationPersistenceData(
      inputItems,
      porcentaje_fee ?? cotizacionActual?.porcentaje_fee ?? 0.15,
      iva_activo ?? cotizacionActual?.iva_activo ?? true,
      descuento_tipo ?? cotizacionActual?.descuento_tipo ?? 'monto',
      descuento_valor ?? cotizacionActual?.descuento_valor ?? 0
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

    await saveCotizacionAtomic(payload)
    await runNonCriticalAutosaves(cotizacionData.cliente, cotizacionData.proyecto, inputItems)

    return Response.json(await getCotizacionById(folio), { status: cotizacionActual ? 200 : 201 })
  } catch (error) {
    console.error('[POST /api/cotizaciones] Error creando cotización:', formatSupabaseError(error))
    return Response.json({ error: 'Error creando cotización' }, { status: 500 })
  }
}
