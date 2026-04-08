import { supabaseAdmin } from '@/lib/supabase'
import { ItemPatchSchema, validate } from '@/lib/validation/schemas'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const validation = validate(ItemPatchSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const { responsable_id, responsable_nombre, notas } = body

    const { data: item, error: itemError } = await supabaseAdmin
      .from('items_cotizacion')
      .select('*')
      .eq('id', id)
      .single()

    if (itemError || !item) {
      return Response.json({ error: 'Item no encontrado' }, { status: 404 })
    }

    const updateFields: Record<string, unknown> = {}
    if ('responsable_id' in body) updateFields.responsable_id = responsable_id || null
    if ('responsable_nombre' in body) updateFields.responsable_nombre = responsable_nombre || null
    if ('notas' in body) updateFields.notas = notas ?? null

    const { error: updateError } = await supabaseAdmin
      .from('items_cotizacion')
      .update(updateFields)
      .eq('id', id)

    if (updateError) throw updateError

    if (!('responsable_id' in body) && !('responsable_nombre' in body)) {
      return Response.json({ ok: true })
    }

    let responsableData: { telefono?: string | null; correo?: string | null; clabe?: string | null; banco?: string | null } | null = null
    if (responsable_id) {
      const { data } = await supabaseAdmin
        .from('responsables')
        .select('telefono, correo, clabe, banco')
        .eq('id', responsable_id)
        .single()
      responsableData = data
    }

    const cuentasPayload = {
      responsable_nombre: responsable_nombre || 'Sin asignar',
      responsable_id: responsable_id || null,
      telefono: responsableData?.telefono ?? null,
      correo: responsableData?.correo ?? null,
      clabe: responsableData?.clabe ?? null,
      banco: responsableData?.banco ?? null,
    }

    const { error: syncByItemIdError } = await supabaseAdmin
      .from('cuentas_pagar')
      .update(cuentasPayload)
      .eq('cotizacion_id', item.cotizacion_id)
      .eq('item_id', id)

    if (syncByItemIdError) throw syncByItemIdError

    const { error: syncLegacyError } = await supabaseAdmin
      .from('cuentas_pagar')
      .update(cuentasPayload)
      .eq('cotizacion_id', item.cotizacion_id)
      .is('item_id', null)
      .eq('item_descripcion', item.descripcion)

    if (syncLegacyError) throw syncLegacyError

    return Response.json({ ok: true })
  } catch (e) {
    console.error('[PATCH /api/items/:id] Error:', e)
    return Response.json({ error: 'Error actualizando responsable' }, { status: 500 })
  }
}
