import { requireAnySection, requireSection } from '@/lib/api-auth'
import { getResponsables, createResponsable } from '@/lib/db'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

// Fase 8c: Caché en servidor para responsables (5 minutos TTL)
const CACHE_TTL = 5 * 60 * 1000
const searchCache = new Map<string, { data: any; timestamp: number }>()

export async function GET() {
  const authResult = await requireAnySection(['responsables', 'cotizaciones'])
  if (authResult.response) return authResult.response

  try {
    // Fase 8c: Verificar caché antes de consultar BD
    const cacheKey = 'responsables:all'
    const cached = searchCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return Response.json(cached.data)
    }

    const responsables = await getResponsables()

    // Guardar en caché para futuras búsquedas
    searchCache.set(cacheKey, { data: responsables, timestamp: Date.now() })
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
    const responsable = await createResponsable({ ...body, activo: true })
    triggerSheetsSync('responsables')
    return Response.json(responsable, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando colaborador' }, { status: 500 })
  }
}
