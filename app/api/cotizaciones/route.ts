import { requireSection } from '@/lib/api-auth'
import { buscarCotizaciones, getCotizacionById } from '@/lib/db'
import { formatSupabaseError } from '@/lib/quotations/rpc-utils'
import {
  buildCreateCotizacionPayload,
  createOrReplaceCotizacion,
  runQuotationNonCriticalAutosaves,
  saveNotas,
} from '@/lib/server/quotations/persistence'
import { CotizacionCreateSchema, validate } from '@/lib/validation/schemas'
import { ItemCotizacion } from '@/lib/types'
import { consumeReservedQuotationFolio, reserveNextQuotationFolio } from '@/lib/server/quotations/folio'

// EF-3 3B-4: busqueda/paginacion/conteos server-side via RPC unica
// buscar_cotizaciones (db/migrations/20260914_buscar_cotizaciones.sql) --
// filas resumen (sin `items`), no la tabla completa con JOIN a
// items_cotizacion(*) que traía antes sin límite.
export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const estado = searchParams.get('estado')
    const page = Number(searchParams.get('page')) || 1
    const pageSize = Number(searchParams.get('pageSize')) || 10
    const result = await buscarCotizaciones(search, estado, page, pageSize)
    return Response.json(result)
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
    const reservationTokenFromBody = typeof body.reservation_token === 'string' ? body.reservation_token.trim() : ''
    const requestedIdFromBody = typeof body.id === 'string' ? body.id.trim() : ''

    const validation = validate(CotizacionCreateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const parsed = validation.data
    const { items, porcentaje_fee, iva_activo, descuento_tipo, descuento_valor, ...cotizacionData } = parsed
    const inputItems = Array.isArray(items) ? (items as Partial<ItemCotizacion>[]) : []

    let reservedFolio = requestedIdFromBody
    let reservationToken = reservationTokenFromBody

    if (!reservedFolio) {
      const reservation = await reserveNextQuotationFolio(
        typeof cotizacionData.es_complementaria_de === 'string' ? cotizacionData.es_complementaria_de : undefined
      )
      reservedFolio = reservation.folio
      reservationToken = reservation.reservationToken || ''
    }

    const { folio, payload } = await buildCreateCotizacionPayload(
      { ...cotizacionData, id: reservedFolio } as Record<string, unknown>,
      inputItems,
      {
        porcentaje_fee,
        iva_activo,
        descuento_tipo,
        descuento_valor,
        forcedFolio: reservedFolio,
        preventOverwrite: true,
      }
    )

    await createOrReplaceCotizacion(payload)
    if (parsed.notas_internas !== undefined || parsed.notas_pdf !== undefined) {
      await saveNotas(folio, { notas_internas: parsed.notas_internas, notas_pdf: parsed.notas_pdf })
    }
    await consumeReservedQuotationFolio(folio, reservationToken || null)
    await runQuotationNonCriticalAutosaves(cotizacionData.cliente, cotizacionData.proyecto, inputItems, 'POST /api/cotizaciones', folio)

    return Response.json(await getCotizacionById(folio), { status: 201 })
  } catch (error) {
    const message = formatSupabaseError(error)
    const status = String(message).includes('folio reservado') || String(message).includes('reserva de folio') ? 409 : 500
    console.error('[POST /api/cotizaciones] Error creando cotizacion:', message)
    return Response.json({ error: message || 'Error creando cotizacion' }, { status })
  }
}
