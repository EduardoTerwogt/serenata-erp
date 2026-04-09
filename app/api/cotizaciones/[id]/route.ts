import { requireSection } from '@/lib/api-auth'
import {
  deleteCotizacion,
  deleteItemsByCotizacion,
  getCotizacionById,
} from '@/lib/db'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { ItemCotizacion } from '@/lib/types'
import { formatSupabaseError } from '@/lib/quotations/rpc-utils'
import {
  buildUpdateCotizacionPayload,
  createOrReplaceCotizacion,
  runQuotationNonCriticalAutosaves,
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

    const payload = await buildUpdateCotizacionPayload(
      id,
      previousCotizacion,
      cotizacionData as Record<string, unknown>,
      inputItems,
      { porcentaje_fee, iva_activo, descuento_tipo, descuento_valor }
    )

    await createOrReplaceCotizacion(payload)
    await runQuotationNonCriticalAutosaves(payload.cliente, payload.proyecto, inputItems ?? [], 'PUT /api/cotizaciones/:id')
    triggerSheetsSync('cotizaciones', 'items_cotizacion')

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
    const cotizacion = await getCotizacionById(id)
    if (cotizacion.estado !== 'BORRADOR') {
      return Response.json(
        { error: 'Solo se pueden borrar cotizaciones en estado BORRADOR. Usa cancelar para EMITIDA/APROBADA.' },
        { status: 403 }
      )
    }
    await deleteItemsByCotizacion(id)
    await deleteCotizacion(id)
    triggerSheetsSync('cotizaciones', 'items_cotizacion')
    return Response.json({ ok: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error eliminando cotización' }, { status: 500 })
  }
}
