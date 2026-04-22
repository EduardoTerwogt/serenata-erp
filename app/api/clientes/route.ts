import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { CacheManager } from '@/lib/api/cache'
import { z } from 'zod'

const cache = new CacheManager(5 * 60 * 1000)

const ClientePostSchema = z.object({
  nombre: z.string().min(1, 'nombre requerido').max(255, 'nombre demasiado largo').trim(),
})

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim().slice(0, 100)

  const cacheKey = `clientes:${q}`
  const cached = cache.get(cacheKey)
  if (cached) {
    return Response.json(cached)
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
    return Response.json({ error: 'Error obteniendo clientes' }, { status: 500 })
  }

  cache.set(cacheKey, data || [])
  return Response.json(data || [])
}

export async function POST(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const parsed = ClientePostSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const { nombre } = parsed.data

    const { data, error } = await supabaseAdmin
      .from('clientes')
      .upsert({ nombre, activo: true }, { onConflict: 'nombre' })
      .select()
      .maybeSingle()

    if (error) {
      console.error('[POST /api/clientes] Error:', error)
      return Response.json({ error: 'Error creando cliente' }, { status: 500 })
    }

    cache.invalidate('clientes:')
    triggerSheetsSync('clientes')
    return Response.json(data, { status: 201 })
  } catch (e) {
    console.error('[POST /api/clientes] Error inesperado:', e)
    return Response.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
