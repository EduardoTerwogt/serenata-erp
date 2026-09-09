import { after } from 'next/server'
import { requireSection } from '@/lib/api-auth'
import { findOrCreateProveedorByNombre } from '@/lib/db'
import { recalculateQuotationHeader, runQuotationNonCriticalAutosaves } from '@/lib/server/quotations/persistence'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { sendRealtimeBroadcast } from '@/lib/server/realtime/broadcast'
import { supabaseAdmin } from '@/lib/supabase'
import { ItemCotizacion } from '@/lib/types'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id, itemId } = await params
    const body = await request.json().catch(() => ({}))

    // Un nombre de responsable por texto libre (sin id -- p. ej. viene de Planeación o
    // de "copiar desde otra cotización") siempre debe resolver a un proveedor real,
    // nunca quedarse en texto suelto (Fase 5.3 Bloque 0, punto 2). Se resuelve ANTES
    // de la RPC para que al patch viajen ya los dos campos.
    let responsableId = body?.responsable_id !== undefined ? (body.responsable_id ? String(body.responsable_id) : '') : undefined
    let responsableNombre = body?.responsable_nombre !== undefined ? (body.responsable_nombre ? String(body.responsable_nombre) : '') : undefined
    if (responsableNombre && !responsableId) {
      const proveedor = await findOrCreateProveedorByNombre(responsableNombre)
      responsableId = proveedor.id
      responsableNombre = proveedor.nombre
    }

    // Solo viajan las claves que llegaron: la RPC conserva el resto de la fila. Antes
    // se leía la cotización entera, se fusionaba el campo sobre esa copia y se
    // reescribía la fila completa, así que dos personas editando celdas distintas de
    // la misma fila se pisaban (la de A se perdía y ganaba la de B). Ver
    // db/migrations/20260909_patch_item_cotizacion_rpc.sql.
    const patch: Record<string, unknown> = {
      ...(body?.categoria !== undefined ? { categoria: String(body.categoria || '') } : {}),
      ...(body?.descripcion !== undefined ? { descripcion: String(body.descripcion || '') } : {}),
      ...(body?.cantidad !== undefined ? { cantidad: Number(body.cantidad) || 0 } : {}),
      ...(body?.precio_unitario !== undefined ? { precio_unitario: Number(body.precio_unitario) || 0 } : {}),
      ...(body?.x_pagar !== undefined ? { x_pagar: Number(body.x_pagar) || 0 } : {}),
      ...(responsableId !== undefined ? { responsable_id: responsableId } : {}),
      ...(responsableNombre !== undefined ? { responsable_nombre: responsableNombre } : {}),
    }

    const { data: itemPatcheado, error: patchError } = await supabaseAdmin.rpc('patch_item_cotizacion', {
      p_cotizacion_id: id,
      p_item_id: itemId,
      p_patch: patch,
    })
    if (patchError) throw patchError
    if (!itemPatcheado) {
      return Response.json({ error: 'Partida no encontrada' }, { status: 404 })
    }

    const updatedQuotation = await recalculateQuotationHeader(id)
    const updatedItem = (updatedQuotation.items || []).find((item) => item.id === itemId) ?? (itemPatcheado as ItemCotizacion)
    // No crítico: se difiere para no retrasar la respuesta que espera el usuario.
    after(async () => { await runQuotationNonCriticalAutosaves(updatedQuotation.cliente, updatedQuotation.proyecto, updatedItem ? [updatedItem] : [], 'PATCH /api/cotizaciones/:id/items/:itemId') })
    triggerSheetsSync('cotizaciones', 'items_cotizacion')
    // Evento confirmado por servidor tras el commit -- payload chico (ids +
    // timestamp, nunca la partida completa). Nadie lo consume del lado UI
    // todavía; es la prueba end-to-end de la infraestructura de Fase 1.
    void sendRealtimeBroadcast([{
      topic: `cotizacion:${id}`,
      event: 'item_confirmed',
      payload: { cotizacion_id: id, item_id: itemId, at: new Date().toISOString() },
    }])

    return Response.json({ item: updatedItem })
  } catch (error) {
    console.error('[PATCH /api/cotizaciones/:id/items/:itemId] Error actualizando item:', error)
    return Response.json({ error: 'Error actualizando partida' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id, itemId } = await params
    const { error } = await supabaseAdmin
      .from('items_cotizacion')
      .delete()
      .eq('cotizacion_id', id)
      .eq('id', itemId)

    if (error) throw error

    await recalculateQuotationHeader(id)
    triggerSheetsSync('cotizaciones', 'items_cotizacion')
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[DELETE /api/cotizaciones/:id/items/:itemId] Error eliminando item:', error)
    return Response.json({ error: 'Error eliminando partida' }, { status: 500 })
  }
}
