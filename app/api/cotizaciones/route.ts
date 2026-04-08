import {
  createCotizacion,
  deleteCotizacion,
  getCotizacionById,
  getNextFolio,
  getNextFolioComplementaria,
  updateCotizacion,
} from '@/lib/db'
import { ItemCotizacion } from '@/lib/types'
import { supabaseAdmin } from '@/lib/supabase'
import { buildPersistedQuotationItems, buildQuotationPersistenceData } from '@/lib/quotations/mappers'
import { CotizacionCreateSchema, validate } from '@/lib/validation/schemas'

/** Reemplaza items de una cotización en una sola transacción Postgres.
 *  Si el INSERT falla, el DELETE se revierte → items anteriores preservados. */
async function replaceItems(cotizacionId: string, items: ReturnType<typeof buildPersistedQuotationItems>) {
  const { error } = await supabaseAdmin.rpc('replace_cotizacion_items', {
    p_cotizacion_id: cotizacionId,
    p_items: items,
  })
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
    delete (cotizacionData as Record<string, unknown>).id

    const persistenceData = buildQuotationPersistenceData(
      inputItems,
      porcentaje_fee ?? 0.15,
      iva_activo ?? true,
      descuento_tipo ?? 'monto',
      descuento_valor ?? 0
    )
    const fechaCotizacion = new Date().toISOString().split('T')[0]

    const normalizedCotizacionData = {
      ...cotizacionData,
      ...persistenceData,
      tipo: cotizacionData.tipo ?? 'PRINCIPAL',
      estado: cotizacionData.estado ?? 'BORRADOR',
      fecha_cotizacion: fechaCotizacion,
    }

    const { data: cotizacionExistente } = await supabaseAdmin
      .from('cotizaciones')
      .select('id')
      .eq('id', folio)
      .maybeSingle()

    if (cotizacionExistente) {
      const cotizacionActual = await getCotizacionById(folio).catch(() => null)
      await updateCotizacion(folio, {
        ...normalizedCotizacionData,
        fecha_cotizacion: cotizacionActual?.fecha_cotizacion || fechaCotizacion,
      })
      // DELETE + INSERT atómico: si falla, items anteriores quedan intactos
      await replaceItems(folio, buildPersistedQuotationItems(folio, inputItems))
      await autosaveClienteYProyecto(cotizacionData.cliente, cotizacionData.proyecto)
      await autosaveProductos(inputItems)
      return Response.json(await getCotizacionById(folio), { status: 200 })
    }

    await createCotizacion({ id: folio, ...normalizedCotizacionData })

    try {
      // DELETE + INSERT atómico: si falla, cotización header queda sin items (estado conocido)
      await replaceItems(folio, buildPersistedQuotationItems(folio, inputItems))
      await autosaveClienteYProyecto(cotizacionData.cliente, cotizacionData.proyecto)
      await autosaveProductos(inputItems)
      return Response.json(await getCotizacionById(folio), { status: 201 })
    } catch (error) {
      await deleteCotizacion(folio).catch(() => {})
      throw error
    }
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando cotización' }, { status: 500 })
  }
}
