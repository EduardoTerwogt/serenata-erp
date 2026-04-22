import { requireAnySection, requireSection } from '@/lib/api-auth'
import { getResponsables, createResponsable } from '@/lib/db'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { CacheManager } from '@/lib/api/cache'
import { validate, ResponsableCreateSchema } from '@/lib/validation/schemas'

// Fase 8c: Caché en servidor para responsables (5 minutos TTL)
const cache = new CacheManager(5 * 60 * 1000)

export async function GET() {
  const authResult = await requireAnySection(['responsables', 'cotizaciones'])
  if (authResult.response) return authResult.response

  try {
    // Fase 8c: Verificar caché antes de consultar BD
    const cacheKey = 'responsables:all'
    const cached = cache.get(cacheKey)
    if (cached) {
      return Response.json(cached)
    }

    const responsables = await getResponsables()

    // Guardar en caché para futuras búsquedas
    cache.set(cacheKey, responsables)
    return Response.json(responsables)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo responsables' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authResult = await requireSection('responsables')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const validation = validate(ResponsableCreateSchema, body)
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
    const responsable = await createResponsable({ ...validation.data, activo: true })

    // Invalidate cache after successful creation
    cache.invalidate('responsables:')

    triggerSheetsSync('responsables')
    return Response.json(responsable, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando colaborador' }, { status: 500 })
  }
}
