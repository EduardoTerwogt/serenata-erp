import { requireSection } from '@/lib/api-auth'
import { cargarResumen } from '@/lib/server/cuentas/periodo-rpc'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import { crearTiempos } from '@/lib/server/server-timing'

const ROUTE = 'GET /api/cuentas/resumen'

/**
 * Rediseño de Cuentas B3 (docs/PLAN.md, S4, O1b): años con su número de
 * proyectos pendientes (select de periodo) y el contador de avisos, derivados
 * en SQL sobre todos los años (`cuentas_resumen`). El cliente la pide una vez
 * por carga.
 */
export async function GET() {
  const t = crearTiempos()
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response
  t.marcar('auth')

  try {
    const resumen = await cargarResumen(hoyCdmx())
    t.marcar('rpc')
    return t.responder(resumen)
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
