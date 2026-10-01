import { after } from 'next/server'
import { requireSection } from '@/lib/api-auth'
import {
  deleteCotizacion,
  deleteItemsByCotizacion,
  getCotizacionById,
  EstadoCotizacionInvalidoError,
} from '@/lib/db'
import { ItemCotizacion } from '@/lib/types'
import { formatSupabaseError } from '@/lib/quotations/rpc-utils'
import {
  buildUpdateCotizacionPayload,
  createOrReplaceCotizacion,
  autosaveProductosCatalogo,
  resolverClienteId,
  saveNotas,
} from '@/lib/server/quotations/persistence'
import { CotizacionUpdateSchema, validate } from '@/lib/validation/schemas'

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

    const body = await request.json()

    const validation = validate(CotizacionUpdateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const parsed = validation.data
    const { items, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor, ...cotizacionData } = parsed
    const inputItems = Array.isArray(items) ? (items as Partial<ItemCotizacion>[]) : null

    // Cliente resuelto antes de guardar (id dentro del payload de save_cotizacion).
    const clienteId =
      cotizacionData.cliente_id ||
      (cotizacionData.cliente === previousCotizacion.cliente ? previousCotizacion.cliente_id : null) ||
      (await resolverClienteId(cotizacionData.cliente))

    const payload = await buildUpdateCotizacionPayload(
      id,
      previousCotizacion,
      { ...cotizacionData, cliente_id: clienteId ?? undefined } as Record<string, unknown>,
      inputItems,
      { porcentaje_fee, iva_activo, descuento_tipo, descuento_valor }
    )

    await createOrReplaceCotizacion(payload)
    if (parsed.notas_internas !== undefined || parsed.notas_pdf !== undefined) {
      await saveNotas(id, { notas_internas: parsed.notas_internas, notas_pdf: parsed.notas_pdf })
    }
    after(async () => { await autosaveProductosCatalogo(inputItems ?? [], 'PUT /api/cotizaciones/:id') })

    return Response.json(await getCotizacionById(id))
  } catch (error) {
    if (error instanceof EstadoCotizacionInvalidoError) {
      return Response.json({ error: 'estado_invalido', estado_actual: error.estadoActual, message: error.message }, { status: 409 })
    }
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
    const cotizacion = await getCotizacionById(id)
    if (cotizacion.estado !== 'BORRADOR') {
      return Response.json(
        { error: 'Solo se pueden borrar cotizaciones en estado BORRADOR. Usa cancelar para EMITIDA/APROBADA.' },
        { status: 403 }
      )
    }
    await deleteItemsByCotizacion(id)
    await deleteCotizacion(id)
    return Response.json({ ok: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error eliminando cotización' }, { status: 500 })
  }
}
