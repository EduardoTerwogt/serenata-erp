import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const results: Record<string, unknown> = {}

  // 1. Poblar clientes desde cotizaciones existentes
  const { data: cotizaciones } = await supabaseAdmin
    .from('cotizaciones')
    .select('cliente')
    .not('cliente', 'is', null)
    .neq('cliente', '')

  const clientesSet: Record<string, true> = {}
  for (const c of cotizaciones ?? []) if (c.cliente) clientesSet[c.cliente] = true
  const clientesUnicos = Object.keys(clientesSet)

  for (const nombre of clientesUnicos) {
    await supabaseAdmin
      .from('clientes')
      .upsert({ nombre }, { onConflict: 'nombre', ignoreDuplicates: true })
  }
  results.clientes = clientesUnicos.length + ' clientes insertados'

  // 2. Poblar productos desde items existentes
  const { data: items } = await supabaseAdmin
    .from('items_cotizacion')
    .select('descripcion, categoria, precio_unitario, x_pagar')
    .not('descripcion', 'is', null)
    .neq('descripcion', '')
    .gt('precio_unitario', 0)

  const productosUnicos: Record<string, { descripcion: string; categoria: string | null; precio_unitario: number; x_pagar: number | null }> = {}
  for (const item of items ?? []) {
    if (!productosUnicos[item.descripcion]) {
      productosUnicos[item.descripcion] = item
    }
  }

  const productosArr = Object.values(productosUnicos)
  for (const item of productosArr) {
    await supabaseAdmin
      .from('productos')
      .upsert({
        descripcion: item.descripcion,
        categoria: item.categoria || '',
        precio_unitario: item.precio_unitario,
        x_pagar_sugerido: item.x_pagar || 0,
      }, { onConflict: 'descripcion', ignoreDuplicates: true })
  }
  results.productos = productosArr.length + ' productos insertados'

  // 3. Poblar historial desde cotizaciones aprobadas
  const { data: itemsAprobados } = await supabaseAdmin
    .from('items_cotizacion')
    .select('*, cotizaciones!inner(proyecto, cliente, fecha_entrega, estado)')
    .not('responsable_id', 'is', null)
    .eq('cotizaciones.estado', 'APROBADA')

  let historialCount = 0
  for (const item of itemsAprobados ?? []) {
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
    if (!error) historialCount++
    else console.error('[seed] historial error:', error, 'item:', item.descripcion)
  }
  results.historial = historialCount + ' registros de historial insertados'

  return NextResponse.json({ success: true, results })
}
