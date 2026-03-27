import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''

  let query = supabaseAdmin
    .from('clientes')
    .select('id, nombre, proyectos')
    .eq('activo', true)
    .order('nombre')

  if (q) {
    query = query.ilike('nombre', `%${q}%`).limit(10)
  }

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/clientes] Error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  console.log('[GET /api/clientes] q:', q || '(todos)', '| encontrados:', data?.length ?? 0)
  return Response.json(data || [])
}

export async function POST(request: Request) {
  try {
    const { nombre } = await request.json()
    const normalizedName = String(nombre || '').trim()

    if (!normalizedName) {
      return Response.json({ error: 'nombre requerido' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('clientes')
      .upsert({ nombre: normalizedName, activo: true }, { onConflict: 'nombre' })
      .select()
      .maybeSingle()

    if (error) {
      console.error('[POST /api/clientes] Error:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }

    console.log('[POST /api/clientes] upsert resultado:', data)
    return Response.json(data, { status: 201 })
  } catch (e) {
    console.error('[POST /api/clientes] Error inesperado:', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
