import { after } from 'next/server'
import { requireSection } from '@/lib/api-auth'
import { getCotizacionById, upsertItems } from '@/lib/db'
import { normalizeQuotationItem } from '@/lib/quotations/calculations'
import { recalculateQuotationHeader, runQuotationNonCriticalAutosaves } from '@/lib/server/quotations/persistence'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { sendRealtimeBroadcast } from '@/lib/server/realtime/broadcast'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    // Fase 6B: el cliente genera el id definitivo de la fila ANTES de pintarla
    // (crypto.randomUUID()) y lo manda aquí -- la identidad de la fila nunca
    // cambia durante su vida. `upsertItems` es upsert por id, así que un
    // reintento con el mismo id (red que reintenta, doble click) converge al
    // mismo estado en vez de crear una fila duplicada. Sin id en el body
    // (compatibilidad con un cliente viejo) se sigue generando en servidor.
    const clientId = typeof body?.id === 'string' && UUID_RE.test(body.id) ? body.id : null
    const cotizacion = await getCotizacionById(id)
    const previousItems = cotizacion.items || []

    // Reintento de una creación que ya se confirmó (red que reintenta tras
    // perder la respuesta, doble click): la fila ya existe, se devuelve tal
    // cual -- sin volver a escribir ni a emitir el evento confirmado.
    if (clientId) {
      const yaExiste = previousItems.find((item) => item.id === clientId)
      if (yaExiste) return Response.json({ item: yaExiste })
    }

    const nextOrder = previousItems.reduce((max, item) => Math.max(max, item.orden ?? 0), -1) + 1
    const itemId = clientId ?? crypto.randomUUID()
    const normalized = normalizeQuotationItem({
      id: itemId,
      categoria: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      responsable_id: '',
      responsable_nombre: '',
      x_pagar: 0,
    })

    await upsertItems([{
      id: itemId,
      cotizacion_id: id,
      categoria: normalized.categoria,
      descripcion: normalized.descripcion,
      cantidad: normalized.cantidad,
      precio_unitario: normalized.precio_unitario,
      importe: normalized.importe,
      responsable_id: null,
      responsable_nombre: null,
      x_pagar: normalized.x_pagar,
      margen: normalized.margen,
      orden: nextOrder,
      notas: null,
    }])

    const updatedQuotation = await recalculateQuotationHeader(id)
    const createdItem = (updatedQuotation.items || []).find((item) => item.id === itemId)
    // No crítico: se difiere para no retrasar la respuesta que espera el usuario.
    after(async () => { await runQuotationNonCriticalAutosaves(updatedQuotation.cliente, updatedQuotation.proyecto, createdItem ? [createdItem] : [], 'POST /api/cotizaciones/:id/items') })
    triggerSheetsSync('cotizaciones', 'items_cotizacion')
    // Evento confirmado por servidor tras el commit -- payload chico (ids +
    // revision + timestamp, nunca la partida completa).
    void sendRealtimeBroadcast([{
      topic: `cotizacion:${id}`,
      event: 'item_confirmed',
      payload: {
        cotizacion_id: id,
        item_id: itemId,
        revision: createdItem?.revision ?? null,
        mutation_id: null,
        operation: 'create',
        at: new Date().toISOString(),
      },
      private: true,
    }])

    return Response.json({ item: createdItem })
  } catch (error) {
    console.error('[POST /api/cotizaciones/:id/items] Error creando item:', error)
    return Response.json({ error: 'Error creando partida' }, { status: 500 })
  }
}
