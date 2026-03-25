import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .select('id, nombre')
    .ilike('nombre', `%${q}%`)
    .eq('activo', true)
    .order('nombre')
    .limit(10)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  console.log('[GET /api/clientes] q:', q, '| encontrados:', data?.length ?? 0)
  return Response.json(data || [])
}

export async function POST(request: Request) {
  const { nombre } = await request.json()
  if (!nombre) return Response.json({ error: 'nombre requerido' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('clientes')
    .upsert({ nombre }, { onConflict: 'nombre', ignoreDuplicates: true })
    .select()
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
