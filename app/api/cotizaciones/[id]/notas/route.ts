import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import { saveNotasInternas } from '@/lib/server/quotations/persistence'
import { sendRealtimeBroadcast } from '@/lib/server/realtime/broadcast'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const notas = typeof body?.notas_internas === 'string'
      ? body.notas_internas
      : body?.notas_internas == null
        ? null
        : String(body.notas_internas)

    await saveNotasInternas(id, notas)
    // Evento confirmado por servidor tras el commit -- antes Notas solo se
    // refrescaba vía `section_saved` (aviso del navegador que guardó, sin
    // acuse del servidor).
    void sendRealtimeBroadcast([{
      topic: `cotizacion:${id}`,
      event: 'notas_confirmed',
      payload: { cotizacion_id: id, at: new Date().toISOString() },
      private: true,
    }])
    return Response.json(await getCotizacionById(id))
  } catch (error) {
    console.error('[PATCH /api/cotizaciones/:id/notas] Error guardando notas:', error)
    return Response.json({ error: 'Error guardando notas internas' }, { status: 500 })
  }
}
