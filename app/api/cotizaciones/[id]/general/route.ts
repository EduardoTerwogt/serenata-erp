import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import {
  buildUpdateCotizacionPayload,
  createOrReplaceCotizacion,
  runQuotationNonCriticalAutosaves,
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
      {
        cliente: typeof body?.cliente === 'string' ? body.cliente : previousCotizacion.cliente,
        proyecto: typeof body?.proyecto === 'string' ? body.proyecto : previousCotizacion.proyecto,
        fecha_entrega: typeof body?.fecha_entrega === 'string' || body?.fecha_entrega === null ? body.fecha_entrega : previousCotizacion.fecha_entrega,
        locacion: typeof body?.locacion === 'string' || body?.locacion === null ? body.locacion : previousCotizacion.locacion,
      },
      null,
      {}
    )

    await createOrReplaceCotizacion(payload)
    await runQuotationNonCriticalAutosaves(payload.cliente, payload.proyecto, [], 'PATCH /api/cotizaciones/:id/general')
    triggerSheetsSync('cotizaciones', 'items_cotizacion')

    return Response.json(await getCotizacionById(id))
  } catch (error) {
    console.error('[PATCH /api/cotizaciones/:id/general] Error guardando general:', error)
    return Response.json({ error: 'Error guardando información general' }, { status: 500 })
  }
}
