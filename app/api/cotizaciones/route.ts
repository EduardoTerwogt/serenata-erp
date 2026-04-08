import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import { formatSupabaseError } from '@/lib/quotations/rpc-utils'
import {
  buildCreateCotizacionPayload,
  createOrReplaceCotizacion,
  runQuotationNonCriticalAutosaves,
} from '@/lib/server/quotations/persistence'
import { CotizacionCreateSchema, validate } from '@/lib/validation/schemas'
import { ItemCotizacion } from '@/lib/types'
import { supabaseAdmin } from '@/lib/supabase'
import { consumeReservedQuotationFolio } from '@/lib/server/quotations/folio'

export async function GET() {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

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
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const reservationToken = typeof body.reservation_token === 'string' ? body.reservation_token.trim() : ''
    const requestedId = typeof body.id === 'string' ? body.id.trim() : ''

    const validation = validate(CotizacionCreateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const parsed = validation.data
    const { items, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor, ...cotizacionData } = parsed
    const inputItems = Array.isArray(items) ? (items as Partial<ItemCotizacion>[]) : []

    const usingReservedFolio = !!requestedId

    if (usingReservedFolio) {
      await consumeReservedQuotationFolio(requestedId, reservationToken || null)
    }

    const { folio, payload, wasExisting } = await buildCreateCotizacionPayload(
      { ...cotizacionData, ...(requestedId ? { id: requestedId } : {}) } as Record<string, unknown>,
      inputItems,
      {
        porcentaje_fee,
        iva_activo,
        descuento_tipo,
        descuento_valor,
        ...(requestedId ? { forcedFolio: requestedId, preventOverwrite: true } : {}),
      }
    )

    await createOrReplaceCotizacion(payload)
    await runQuotationNonCriticalAutosaves(cotizacionData.cliente, cotizacionData.proyecto, inputItems, 'POST /api/cotizaciones')

    return Response.json(await getCotizacionById(folio), { status: wasExisting ? 200 : 201 })
  } catch (error) {
    const message = formatSupabaseError(error)
    const status = String(message).includes('folio reservado') || String(message).includes('reserva de folio') ? 409 : 500
    console.error('[POST /api/cotizaciones] Error creando cotización:', message)
    return Response.json({ error: message || 'Error creando cotización' }, { status })
  }
}
