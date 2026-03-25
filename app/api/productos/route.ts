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
  if (error) return Response.json({ error: error.message }, { status: 500 })
  console.log('[GET /api/productos] q:', q, '| encontrados:', data?.length ?? 0)
  return Response.json(data || [])
}

export async function POST(request: Request) {
  const { descripcion, categoria, precio_unitario, x_pagar_sugerido } = await request.json()
  if (!descripcion) return Response.json({ error: 'descripcion requerida' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('productos')
    .insert({ descripcion, categoria: categoria || null, precio_unitario: precio_unitario || 0, x_pagar_sugerido: x_pagar_sugerido || 0 })
    .select()
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
