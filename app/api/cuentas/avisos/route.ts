import { requireSection } from '@/lib/api-auth'
import { agruparAvisos } from '@/lib/server/cuentas/avisos'
import { cargarCandidatosAvisos } from '@/lib/server/cuentas/periodo-rpc'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { crearTiempos } from '@/lib/server/server-timing'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'

const ROUTE = 'GET /api/cuentas/avisos'

/**
 * Rediseño de Cuentas B6 (docs/PLAN.md, supuestos 2 y 3, D25, D27, S4, O1b):
 * las 5 categorías de avisos sobre todos los años. Qué concepto entra a cada
 * categoría lo decide SQL (`cuentas_avisos_items`, mismo criterio que
 * derivarAvisos), que devuelve los más urgentes de cada una y su total;
 * textos, `agruparAvisos`.
 */
export async function GET() {
  const t = crearTiempos()
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response
  t.marcar('auth')

  try {
    const hoy = hoyCdmx()
    const { items, totales } = await cargarCandidatosAvisos(hoy)
    t.marcar('rpc')
    return t.responder(agruparAvisos(items, hoy, totales))
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
