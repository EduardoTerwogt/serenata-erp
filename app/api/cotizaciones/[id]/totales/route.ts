import { after } from 'next/server'
import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import { sendRealtimeBroadcast } from '@/lib/server/realtime/broadcast'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

/**
 * Guarda SOLO la configuración de totales (fee, IVA, descuento) y deja que la base
 * recalcule el encabezado con las partidas que haya en ese momento.
 *
 * Antes pasaba por `save_cotizacion` -que borraba y reinsertaba todas las partidas
 * con ids nuevos- y además calculaba los totales en JS a partir de una lectura
 * previa, así que dos guardados simultáneos podían dejar el encabezado con una foto
 * vieja. Ahora el recálculo ocurre dentro de la base, en una sentencia.
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

    const patch: Record<string, unknown> = {
      ...(typeof body?.porcentaje_fee === 'number' ? { porcentaje_fee: body.porcentaje_fee } : {}),
      ...(typeof body?.iva_activo === 'boolean' ? { iva_activo: body.iva_activo } : {}),
      ...(body?.descuento_tipo === 'monto' || body?.descuento_tipo === 'porcentaje' ? { descuento_tipo: body.descuento_tipo } : {}),
      ...(typeof body?.descuento_valor === 'number' ? { descuento_valor: body.descuento_valor } : {}),
    }
    const base: Record<string, unknown> | undefined = body?.base && typeof body.base === 'object' ? body.base : undefined

    const { data, error } = await supabaseAdmin.rpc('patch_cotizacion_totales', {
      p_cotizacion_id: id,
      p_patch: patch,
      p_base: base ?? null,
    })
    if (error) throw error
    if (!data) return Response.json({ error: 'Cotización no encontrada' }, { status: 404 })
    if (typeof data === 'object' && data !== null && 'conflict' in data) {
      return Response.json({ error: 'conflict', entity: 'cotizacion_totales', id, fields: (data as { conflict: unknown }).conflict }, { status: 409 })
    }

    // EF-2 1D-1: en after() -- fire-and-forget puede perderse si la
    // función serverless termina antes de que la promesa resuelva.
    after(async () => {
      await sendRealtimeBroadcast([{
        topic: `cotizacion:${id}`,
        event: 'totales_confirmed',
        payload: { cotizacion_id: id, at: new Date().toISOString() },
        private: true,
      }])
    })

    return Response.json(await getCotizacionById(id))
  } catch (error) {
    console.error('[PATCH /api/cotizaciones/:id/totales] Error guardando totales:', error)
    return Response.json({ error: 'Error guardando configuración de totales' }, { status: 500 })
  }
}
