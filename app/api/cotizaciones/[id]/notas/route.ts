import { after } from 'next/server'
import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import { saveNotas } from '@/lib/server/quotations/persistence'
import { sendRealtimeBroadcast } from '@/lib/server/realtime/broadcast'

function normalizeNotasField(value: unknown): string | null {
  if (typeof value === 'string') return value
  return value == null ? null : String(value)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const notas_internas = normalizeNotasField(body?.notas_internas)
    // Bloque 2 sub-tarea 6: campo nuevo, no reusa notas_internas -- ver
    // saveNotas en lib/server/quotations/persistence.ts. El cliente
    // (useQuotationNotasAutosave) siempre manda los dos valores vigentes
    // juntos, así que no hace falta leer el estado previo aquí.
    const notas_pdf = normalizeNotasField(body?.notas_pdf)

    await saveNotas(id, { notas_internas, notas_pdf })
    // Evento confirmado por servidor tras el commit -- antes Notas solo se
    // refrescaba vía `section_saved` (aviso del navegador que guardó, sin
    // acuse del servidor). EF-2 1D-1: en after().
    after(async () => {
      await sendRealtimeBroadcast([{
        topic: `cotizacion:${id}`,
        event: 'notas_confirmed',
        payload: { cotizacion_id: id, at: new Date().toISOString() },
        private: true,
      }])
    })
    return Response.json(await getCotizacionById(id))
  } catch (error) {
    console.error('[PATCH /api/cotizaciones/:id/notas] Error guardando notas:', error)
    return Response.json({ error: 'Error guardando notas internas' }, { status: 500 })
  }
}
