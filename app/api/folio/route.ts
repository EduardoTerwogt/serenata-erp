import { requireSection } from '@/lib/api-auth'
import { previewNextQuotationFolio } from '@/lib/server/quotations/folio'
import { CacheManager } from '@/lib/api/cache'

// EF-2 1D-3: el gate de p95 en Preview mostró 2314ms sin caché (>1s) --
// única de las 4 rutas medidas que no pasó. Se revierte puntualmente solo
// esta ruta a CacheManager; clientes/productos/proveedores quedan sin
// caché (sí pasaron el gate).
const cache = new CacheManager(5 * 60 * 1000)

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const complementariaDe = (searchParams.get('complementaria_de') || '').trim()

    const cacheKey = `folio:${complementariaDe || 'normal'}`
    const cached = cache.get(cacheKey)
    if (cached) {
      return Response.json(cached)
    }

    const folio = await previewNextQuotationFolio(complementariaDe || undefined)

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
