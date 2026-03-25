import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const { data, error } = await supabaseAdmin
    .from('productos')
    .select('*')
    .ilike('descripcion', `%${q}%`)
    .eq('activo', true)
    .order('descripcion')
    .limit(10)
  if (error) {
    console.error('[GET /api/productos] Error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  console.log('[GET /api/productos] q:', q, '| encontrados:', data?.length ?? 0)
  return Response.json(data || [])
}

export async function POST(request: Request) {
  try {
    const { descripcion, categoria, precio_unitario, x_pagar_sugerido } = await request.json()
    if (!descripcion) return Response.json({ error: 'descripcion requerida' }, { status: 400 })
    const { data, error } = await supabaseAdmin
      .from('productos')
      .insert({ descripcion, categoria: categoria || null, precio_unitario: precio_unitario || 0, x_pagar_sugerido: x_pagar_sugerido || 0 })
      .select()
      .single()
    if (error) {
      console.error('[POST /api/productos] Error:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }
    console.log('[POST /api/productos] creado:', data?.descripcion)
    return Response.json(data, { status: 201 })
  } catch (e) {
    console.error('[POST /api/productos] Error inesperado:', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
