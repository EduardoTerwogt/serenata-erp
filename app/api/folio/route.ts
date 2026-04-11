import { requireSection } from '@/lib/api-auth'
import { previewNextQuotationFolio } from '@/lib/server/quotations/folio'

// Fase 8c: Caché en servidor para folios (5 minutos TTL)
const CACHE_TTL = 5 * 60 * 1000
const searchCache = new Map<string, { data: any; timestamp: number }>()

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const complementariaDe = (searchParams.get('complementaria_de') || '').trim()

    // Fase 8c: Verificar caché antes de consultar BD
    const cacheKey = `folio:${complementariaDe || 'normal'}`
    const cached = searchCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return Response.json(cached.data)
    }

    const folio = await previewNextQuotationFolio(complementariaDe || undefined)

    // Guardar en caché para futuras búsquedas
    searchCache.set(cacheKey, { data: { folio }, timestamp: Date.now() })
    return Response.json({ folio })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error generando folio' }, { status: 500 })
  }
}
