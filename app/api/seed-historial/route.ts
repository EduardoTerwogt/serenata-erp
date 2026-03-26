import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data: items, error: itemsError } = await supabaseAdmin
    .from('items_cotizacion')
    .select(`id, responsable_id, cotizacion_id, descripcion, x_pagar, cotizaciones!inner(proyecto, cliente, fecha_entrega, estado)`)
    .not('responsable_id', 'is', null)
    .eq('cotizaciones.estado', 'APROBADA')

  if (itemsError) {
    console.error('[seed-historial] Error fetching items:', itemsError)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  console.log('[seed-historial] items con responsable en cots aprobadas:', items?.length ?? 0)

  let count = 0
  const errors: string[] = []
  for (const item of items || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cot = (item as any).cotizaciones
    const { error } = await supabaseAdmin
      .from('historial_responsable')
      .upsert({
        responsable_id: item.responsable_id,
        cotizacion_id: item.cotizacion_id,
        proyecto_nombre: cot?.proyecto || '',
        cliente: cot?.cliente || '',
        fecha_evento: cot?.fecha_entrega || null,
        rol_en_proyecto: item.descripcion,
        x_pagar: item.x_pagar,
      }, { onConflict: 'responsable_id,cotizacion_id,rol_en_proyecto', ignoreDuplicates: true })
    if (!error) count++
    else errors.push(String(error.message))
  }

  console.log('[seed-historial] insertados/actualizados:', count, '| errores:', errors.length)
  return NextResponse.json({ success: true, insertados: count, errores: errors })
}
