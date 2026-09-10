import { after } from 'next/server'
import { requireSection } from '@/lib/api-auth'
import { getCotizacionById, upsertItems } from '@/lib/db'
import { normalizeQuotationItem } from '@/lib/quotations/calculations'
import { recalculateQuotationHeader, runQuotationNonCriticalAutosaves } from '@/lib/server/quotations/persistence'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { sendRealtimeBroadcast } from '@/lib/server/realtime/broadcast'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const cotizacion = await getCotizacionById(id)
    const previousItems = cotizacion.items || []
    const nextOrder = previousItems.reduce((max, item) => Math.max(max, item.orden ?? 0), -1) + 1
    const itemId = crypto.randomUUID()
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
    // revision + timestamp, nunca la partida completa). Antes el alta solo se
    // enteraba del otro lado vía `item_mutation` (empuje del navegador, sin
    // acuse del servidor).
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
