import { requireAnySection, requireSection } from '@/lib/api-auth'
import { createCliente, getClientes } from '@/lib/db'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { validate, ClienteCreateSchema } from '@/lib/validation/schemas'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim().slice(0, 100)

  // #123 (T8): la búsqueda por nombre (`?q=`, devuelve solo id y nombre) también la usa el selector de cliente de
  // Cuentas (Subir factura / Registrar pago / Estado de cuenta). SOLO esa rama admite la sección `cuentas`:
  // `?admin=1` (todas las columnas, activos e inactivos), la lista completa y el POST siguen exigiendo `cotizaciones`.
  const esBusqueda = q !== '' && searchParams.get('admin') !== '1'
  const authResult = esBusqueda
    ? await requireAnySection(['cotizaciones', 'cuentas'])
    : await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

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

  let query = supabaseAdmin
    .from('clientes')
    .select('id, nombre')
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

    const cliente = await createCliente({ ...validation.data, activo: true })
    return Response.json(cliente, { status: 201 })
  } catch (e) {
    console.error('[POST /api/clientes] Error:', e)
    return Response.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
