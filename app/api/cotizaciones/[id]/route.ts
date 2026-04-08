import {
  deleteCotizacion,
  deleteItemsByCotizacion,
  getCotizacionById,
  updateCotizacion,
  upsertItems,
} from '@/lib/db'
import { ItemCotizacion } from '@/lib/types'
import { supabaseAdmin } from '@/lib/supabase'
import { buildPersistedQuotationItems, buildQuotationPersistenceData } from '@/lib/quotations/mappers'
import { CotizacionUpdateSchema, validate } from '@/lib/validation/schemas'

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    if (inputItems !== null) {
      Object.assign(
        cotizacionData,
        buildQuotationPersistenceData(
          inputItems,
          porcentaje_fee ?? 0.15,
          iva_activo ?? true,
          descuento_tipo ?? 'monto',
          descuento_valor ?? 0
        )
      )
    }

    try {
      await updateCotizacion(id, cotizacionData)

      if (inputItems !== null) {
        await deleteItemsByCotizacion(id)
        if (inputItems.length > 0) {
          await upsertItems(buildPersistedQuotationItems(id, inputItems, {
            previousItems,
            preservePreviousResponsables: true,
            preservePreviousNotas: true,
          }))
        }
      }

      await autosaveClienteYProyecto(cotizacionData.cliente, cotizacionData.proyecto)
      if (inputItems !== null) {
        await autosaveProductos(inputItems)
      }

      return Response.json(await getCotizacionById(id))
    } catch (error) {
      try {
        const { id: _prevId, items: _prevItems, created_at: _prevCreatedAt, ...previousData } = previousCotizacion
        await updateCotizacion(id, previousData)
        await deleteItemsByCotizacion(id)
        if (previousItems.length > 0) {
          await upsertItems(previousItems.map((item, index) => ({
            ...item,
            cotizacion_id: id,
            orden: item.orden ?? index,
          })))
        }
      } catch (restoreError) {
        console.error('[PUT /api/cotizaciones/:id] Error restaurando snapshot previo:', restoreError)
      }
      throw error
    }
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando cotización' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
