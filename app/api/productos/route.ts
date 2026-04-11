import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

// Fase 8c: Caché en servidor para búsquedas (5 minutos TTL)
const CACHE_TTL = 5 * 60 * 1000
const searchCache = new Map<string, { data: any; timestamp: number }>()

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''

  // Fase 8c: Verificar caché antes de consultar BD
  const cacheKey = `productos:${q}`
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return Response.json(cached.data)
  }

  let query = supabaseAdmin
    .from('productos')
    .select('id, descripcion, categoria, precio_unitario, x_pagar_sugerido')
    .eq('activo', true)
    .order('descripcion')

  if (q) {
    query = query.ilike('descripcion', `%${q}%`).limit(10)
  }

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/productos] Error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Guardar en caché para futuras búsquedas
  searchCache.set(cacheKey, { data: data || [], timestamp: Date.now() })
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
      return Response.json({ error: error.message }, { status: 500 })
    }
    triggerSheetsSync('productos')
    return Response.json(data, { status: 201 })
  } catch (e) {
    console.error('[POST /api/productos] Error inesperado:', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
