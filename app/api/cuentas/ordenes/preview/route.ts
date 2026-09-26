import { requireSection } from '@/lib/api-auth'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { armarPreviewOrden } from '@/lib/server/ordenes-pago/preview-cuentas'
import { cargarCandidatosOrden } from '@/lib/server/ordenes-pago/rpc'

const ROUTE = 'GET /api/cuentas/ordenes/preview'

/**
 * Rediseño de Cuentas B6 (supuesto 13, T2, §5.2): elegibles para una orden
 * agrupados por responsable y proyecto, con su cruce fiscal, y "No
 * incluidas" con su motivo. `generar-orden-pago` conserva su contrato para
 * la UI anterior hasta B8 (R2).
 */
export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    return Response.json(armarPreviewOrden(await cargarCandidatosOrden()))
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
