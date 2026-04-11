import { requireSection } from '@/lib/api-auth'
import { previewNextQuotationFolio } from '@/lib/server/quotations/folio'
import { CacheManager } from '@/lib/api/cache'

// Fase 8c: Caché en servidor para folios (5 minutos TTL)
const cache = new CacheManager(5 * 60 * 1000)

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const complementariaDe = (searchParams.get('complementaria_de') || '').trim()

    // Fase 8c: Verificar caché antes de consultar BD
    const cacheKey = `folio:${complementariaDe || 'normal'}`
    const cached = cache.get(cacheKey)
    if (cached) {
      return Response.json(cached)
    }

    const folio = await previewNextQuotationFolio(complementariaDe || undefined)

    // Guardar en caché para futuras búsquedas
    cache.set(cacheKey, { folio })
    return Response.json({ folio })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error generando folio' }, { status: 500 })
  }
}

/**
 * Invalidate folio cache - called when quotations are approved and folios are consumed
 * Ensures the next folio prediction is accurate after a folio has been reserved
 */
export function invalidateFolioCache() {
  cache.invalidateAll()
}
