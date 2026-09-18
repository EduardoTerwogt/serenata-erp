import { requireSection } from '@/lib/api-auth'
import { getClientes } from '@/lib/db'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { validate, ClienteCreateSchema } from '@/lib/validation/schemas'

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { searchParams } = new URL(request.url)

  // Bloque 5 (docs/PLAN.md): catálogo administrativo -- lista completa
  // (activos e inactivos, todas las columnas), separado del autocomplete de
  // abajo para no tocar su contrato existente (activo=true, campos acotados).
  if (searchParams.get('admin') === '1') {
    try {
      return Response.json(await getClientes())
    } catch (error) {
      console.error('[GET /api/clientes?admin=1] Error:', error)
      return Response.json({ error: 'Error obteniendo clientes' }, { status: 500 })
    }
  }

  const q = (searchParams.get('q') ?? '').trim().slice(0, 100)

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
    return Response.json({ error: 'Error obteniendo clientes' }, { status: 500 })
  }

  return Response.json(data || [])
}

export async function POST(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const validation = validate(ClienteCreateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 400 })
    }

    // Upsert por nombre: preserva el uso existente (crear/encontrar un
    // cliente al vuelo por texto libre desde una cotización) y el nuevo
    // (crear desde el catálogo administrativo, Bloque 5) con el mismo POST.
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .upsert({ ...validation.data, activo: true }, { onConflict: 'nombre' })
      .select()
      .maybeSingle()

    if (error) {
      console.error('[POST /api/clientes] Error:', error)
      return Response.json({ error: 'Error creando cliente' }, { status: 500 })
    }

    return Response.json(data, { status: 201 })
  } catch (e) {
    console.error('[POST /api/clientes] Error inesperado:', e)
    return Response.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
