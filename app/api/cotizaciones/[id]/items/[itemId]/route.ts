import { requireSection } from '@/lib/api-auth'
import { getCotizacionById, upsertItems } from '@/lib/db'
import { normalizeQuotationItem } from '@/lib/quotations/calculations'
import { recalculateQuotationHeader, runQuotationNonCriticalAutosaves } from '@/lib/server/quotations/persistence'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id, itemId } = await params
    const cotizacion = await getCotizacionById(id)
    const existingItem = (cotizacion.items || []).find((item) => item.id === itemId)
    if (!existingItem) {
      return Response.json({ error: 'Partida no encontrada' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const merged = {
      ...existingItem,
      ...(body?.categoria !== undefined ? { categoria: String(body.categoria || '') } : {}),
      ...(body?.descripcion !== undefined ? { descripcion: String(body.descripcion || '') } : {}),
      ...(body?.cantidad !== undefined ? { cantidad: Number(body.cantidad) || 0 } : {}),
      ...(body?.precio_unitario !== undefined ? { precio_unitario: Number(body.precio_unitario) || 0 } : {}),
      ...(body?.x_pagar !== undefined ? { x_pagar: Number(body.x_pagar) || 0 } : {}),
      ...(body?.responsable_id !== undefined ? { responsable_id: body.responsable_id ? String(body.responsable_id) : '' } : {}),
      ...(body?.responsable_nombre !== undefined ? { responsable_nombre: body.responsable_nombre ? String(body.responsable_nombre) : '' } : {}),
    }

    const normalized = normalizeQuotationItem({
      id: itemId,
      categoria: merged.categoria,
      descripcion: merged.descripcion,
      cantidad: merged.cantidad,
      precio_unitario: merged.precio_unitario,
      responsable_id: merged.responsable_id || '',
      responsable_nombre: merged.responsable_nombre || '',
      x_pagar: merged.x_pagar,
    })

    await upsertItems([{
      id: itemId,
      cotizacion_id: id,
      categoria: normalized.categoria,
      descripcion: normalized.descripcion,
      cantidad: normalized.cantidad,
      precio_unitario: normalized.precio_unitario,
      importe: normalized.importe,
      responsable_id: normalized.responsable_id || null,
      responsable_nombre: normalized.responsable_nombre || null,
      x_pagar: normalized.x_pagar,
      margen: normalized.margen,
      orden: existingItem.orden,
      notas: existingItem.notas ?? null,
    }])

    const updatedQuotation = await recalculateQuotationHeader(id)
    const updatedItem = (updatedQuotation.items || []).find((item) => item.id === itemId)
    await runQuotationNonCriticalAutosaves(updatedQuotation.cliente, updatedQuotation.proyecto, updatedItem ? [updatedItem] : [], 'PATCH /api/cotizaciones/:id/items/:itemId')
    triggerSheetsSync('cotizaciones', 'items_cotizacion')

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
