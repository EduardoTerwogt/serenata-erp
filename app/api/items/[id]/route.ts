import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { responsable_id, responsable_nombre } = await request.json()

    // 1. Fetch item to get cotizacion_id and descripcion
    const { data: item, error: itemError } = await supabaseAdmin
      .from('items_cotizacion')
      .select('*')
      .eq('id', id)
      .single()

    if (itemError || !item) {
      return Response.json({ error: 'Item no encontrado' }, { status: 404 })
    }

    // 2. Update items_cotizacion
    const { error: updateError } = await supabaseAdmin
      .from('items_cotizacion')
      .update({
        responsable_id: responsable_id || null,
        responsable_nombre: responsable_nombre || null,
      })
      .eq('id', id)

    if (updateError) throw updateError

    // 3. Fetch responsable details for cuentas_pagar sync
    let responsableData: { telefono?: string | null; correo?: string | null; clabe?: string | null; banco?: string | null } | null = null
    if (responsable_id) {
      const { data } = await supabaseAdmin
        .from('responsables')
        .select('telefono, correo, clabe, banco')
        .eq('id', responsable_id)
        .single()
      responsableData = data
    }

    // 4. Sync cuentas_pagar que coincidan con este item
    const { data: cuentas } = await supabaseAdmin
      .from('cuentas_pagar')
      .select('id')
      .eq('cotizacion_id', item.cotizacion_id)
      .eq('item_descripcion', item.descripcion)

    if (cuentas && cuentas.length > 0) {
      await supabaseAdmin
        .from('cuentas_pagar')
        .update({
          responsable_nombre: responsable_nombre || 'Sin asignar',
          responsable_id: responsable_id || null,
          telefono: responsableData?.telefono ?? null,
          correo: responsableData?.correo ?? null,
          clabe: responsableData?.clabe ?? null,
          banco: responsableData?.banco ?? null,
        })
        .eq('cotizacion_id', item.cotizacion_id)
        .eq('item_descripcion', item.descripcion)
    }

    // 5. Registrar en historial_responsable
    if (responsable_id) {
      const { data: cotizacion } = await supabaseAdmin
        .from('cotizaciones')
        .select('proyecto, cliente, fecha_entrega')
        .eq('id', item.cotizacion_id)
        .single()

      if (cotizacion) {
        await supabaseAdmin
          .from('historial_responsable')
          .insert({
            responsable_id,
            proyecto_id: item.cotizacion_id,
            proyecto: cotizacion.proyecto,
            cliente: cotizacion.cliente,
            fecha_entrega: cotizacion.fecha_entrega,
            monto: item.x_pagar || 0,
          })
      }
    }

    return Response.json({ ok: true })
  } catch (e) {
    console.error('[PATCH /api/items/:id] Error:', e)
    return Response.json({ error: 'Error actualizando responsable' }, { status: 500 })
  }
}
