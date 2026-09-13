import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { sendRealtimeBroadcast } from '@/lib/server/realtime/broadcast'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { Cotizacion } from '@/lib/types'

/**
 * Transición BORRADOR -> EMITIDA. Antes de esta ruta, "Generar Cotización"
 * pasaba por el PUT completo (`save_cotizacion`), el mismo camino sin
 * control de concurrencia que usa `/cotizaciones/nueva` -- si otro
 * colaborador modificaba una partida por PATCH justo antes, ese PUT podía
 * revertirlo. Esta RPC solo toca `estado` bajo `FOR UPDATE`, igual que las
 * demás RPCs de esta iniciativa -- nunca reescribe partidas/general/totales.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { id } = await params

  const { data, error } = await supabaseAdmin.rpc('emitir_cotizacion', { p_cotizacion_id: id })
  if (error) {
    console.error('[POST /api/cotizaciones/:id/emitir] Error:', error)
    return Response.json({ error: 'Error emitiendo cotización' }, { status: 500 })
  }
  if (!data) return Response.json({ error: 'Cotización no encontrada' }, { status: 404 })
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const estadoActual = (data as { estado_actual?: string }).estado_actual
    return Response.json({
      error: `Solo se pueden emitir cotizaciones en estado BORRADOR. Estado actual: ${estadoActual}`,
    }, { status: 400 })
  }

  const emitida = data as Cotizacion
  triggerSheetsSync('cotizaciones')
  void sendRealtimeBroadcast([{
    topic: `cotizacion:${id}`,
    event: 'general_confirmed',
    payload: { cotizacion_id: id, at: new Date().toISOString() },
    private: true,
  }])

  return Response.json(await getCotizacionById(id).catch(() => emitida))
}
