import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''

  let query = supabaseAdmin
    .from('productos')
    .select('id, descripcion, categoria, precio_unitario, x_pagar_sugerido')
    .eq('activo', true)
    .order('descripcion')

  if (q) {
    query = query.ilike('descripcion', `%${q}%`).limit(10)
  } else {
    // Sin `q` (carga completa para autofill client-side, useQuotationForm.ts)
    // esta query no tenía límite explícito: dependía en silencio del tope por
    // defecto de PostgREST (típicamente 1000 filas), así que un catálogo que
    // lo superara truncaba productos nuevos según orden alfabético, sin error
    // ni log (causa real de un fallo repetido en tests/e2e/live, ver
    // ACTIVE_WORK.md). Explícito aquí para no depender de ese default; sigue
    // siendo el patrón "traer todo el catálogo" de Frente A del roadmap
    // (paginación real pendiente, fuera de alcance de este fix puntual).
    query = query.limit(2000)
  }

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/productos] Error:', error)
    return Response.json({ error: 'Error en productos' }, { status: 500 })
  }

  return Response.json(data || [])
}

export async function POST(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { descripcion, categoria, precio_unitario, x_pagar_sugerido } = await request.json()
    const normalizedDescripcion = String(descripcion || '').trim()

    if (!normalizedDescripcion) {
      return Response.json({ error: 'descripcion requerida' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('productos')
      .upsert({
        descripcion: normalizedDescripcion,
        categoria: categoria || null,
        precio_unitario: precio_unitario || 0,
        x_pagar_sugerido: x_pagar_sugerido || 0,
        activo: true,
      }, { onConflict: 'descripcion' })
      .select()
      .maybeSingle()

    if (error) {
      console.error('[POST /api/productos] Error:', error)
      return Response.json({ error: 'Error en productos' }, { status: 500 })
    }

    return Response.json(data, { status: 201 })
  } catch (e) {
    console.error('[POST /api/productos] Error inesperado:', e)
    return Response.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
