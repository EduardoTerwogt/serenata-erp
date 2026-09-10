import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import { runQuotationNonCriticalAutosaves } from '@/lib/server/quotations/persistence'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { sendRealtimeBroadcast } from '@/lib/server/realtime/broadcast'
import { supabaseAdmin } from '@/lib/supabase'
import { Cotizacion } from '@/lib/types'

/**
 * Guarda SOLO los datos generales.
 *
 * Antes pasaba por `save_cotizacion`, que borraba todas las partidas y las
 * reinsertaba con ids nuevos. Como esto se dispara con el autoguardado 800 ms
 * después de teclear el cliente o el proyecto, cada tecleo le cambiaba la identidad
 * a todas las partidas: la otra pantalla -o la tuya misma, con un guardado de celda
 * en vuelo- quedaba apuntando a ids inexistentes, sus ediciones respondían 404 y sus
 * borrados no borraban nada. Era la causa raíz de "se borran los montos" y "no puedo
 * borrar las filas".
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    // Solo viajan las claves que llegaron: la RPC conserva el resto de la fila.
    const patch: Record<string, unknown> = {
      ...(typeof body?.cliente === 'string' ? { cliente: body.cliente } : {}),
      ...(typeof body?.proyecto === 'string' ? { proyecto: body.proyecto } : {}),
      ...(typeof body?.fecha_entrega === 'string' || body?.fecha_entrega === null ? { fecha_entrega: body.fecha_entrega ?? '' } : {}),
      ...(typeof body?.locacion === 'string' || body?.locacion === null ? { locacion: body.locacion ?? '' } : {}),
    }
    // Igual que en items: sin "base" no hay comparación posible y la RPC
    // sobreescribe como siempre (retrocompatible).
    const base: Record<string, unknown> | undefined = body?.base && typeof body.base === 'object' ? body.base : undefined

    const { data, error } = await supabaseAdmin.rpc('patch_cotizacion_general', {
      p_cotizacion_id: id,
      p_patch: patch,
      p_base: base ?? null,
    })
    if (error) throw error
    if (!data) return Response.json({ error: 'Cotización no encontrada' }, { status: 404 })
    if (typeof data === 'object' && data !== null && 'conflict' in data) {
      return Response.json({ error: 'conflict', entity: 'cotizacion_general', id, fields: (data as { conflict: unknown }).conflict }, { status: 409 })
    }

    const actualizada = data as Cotizacion
    await runQuotationNonCriticalAutosaves(actualizada.cliente, actualizada.proyecto, [], 'PATCH /api/cotizaciones/:id/general')
    triggerSheetsSync('cotizaciones', 'items_cotizacion')
    void sendRealtimeBroadcast([{
      topic: `cotizacion:${id}`,
      event: 'general_confirmed',
      payload: { cotizacion_id: id, at: new Date().toISOString() },
      private: true,
    }])

    return Response.json(await getCotizacionById(id))
  } catch (error) {
    console.error('[PATCH /api/cotizaciones/:id/general] Error guardando general:', error)
    return Response.json({ error: 'Error guardando información general' }, { status: 500 })
  }
}
