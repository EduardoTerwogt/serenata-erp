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
  const cacheKey = `clientes:${q}`
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return Response.json(cached.data)
  }

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

  // Guardar en caché para futuras búsquedas
  searchCache.set(cacheKey, { data: data || [], timestamp: Date.now() })
  return Response.json(data || [])
}

export async function POST(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

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
    triggerSheetsSync('clientes')
    return Response.json(data, { status: 201 })
  } catch (e) {
    console.error('[POST /api/clientes] Error inesperado:', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
