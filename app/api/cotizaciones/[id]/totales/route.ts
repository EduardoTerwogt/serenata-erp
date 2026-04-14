import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import {
  buildUpdateCotizacionPayload,
  createOrReplaceCotizacion,
} from '@/lib/server/quotations/persistence'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const previousCotizacion = await getCotizacionById(id)
    const body = await request.json().catch(() => ({}))

    const payload = await buildUpdateCotizacionPayload(
      id,
      previousCotizacion,
      {},
      null,
      {
        porcentaje_fee: typeof body?.porcentaje_fee === 'number' ? body.porcentaje_fee : previousCotizacion.porcentaje_fee,
        iva_activo: typeof body?.iva_activo === 'boolean' ? body.iva_activo : previousCotizacion.iva_activo,
        descuento_tipo: body?.descuento_tipo === 'monto' || body?.descuento_tipo === 'porcentaje' ? body.descuento_tipo : previousCotizacion.descuento_tipo,
        descuento_valor: typeof body?.descuento_valor === 'number' ? body.descuento_valor : previousCotizacion.descuento_valor,
      }
    )

    await createOrReplaceCotizacion(payload)
    triggerSheetsSync('cotizaciones', 'items_cotizacion')

    return Response.json(await getCotizacionById(id))
  } catch (error) {
    console.error('[PATCH /api/cotizaciones/:id/totales] Error guardando totales:', error)
    return Response.json({ error: 'Error guardando configuración de totales' }, { status: 500 })
  }
}
