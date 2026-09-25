import { requireSection } from '@/lib/api-auth'
import { aplicarCorreccion } from '@/lib/server/cuentas/correcciones'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { CorreccionCuentasSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas/correcciones'

/**
 * Rediseño de Cuentas B7 (D5, R8, S12, T7; supuesto 1): correcciones sobre
 * cuentas reabiertas. Solo admin (supuesto 10); que las cuentas estén
 * reabiertas lo exige cada RPC, que además deja registro en
 * cuentas_correcciones:
 * - anular un pago (cobro o proveedor): recalcula saldo, estados y orden;
 * - quitar o reemplazar un documento (baja lógica, queda en el historial);
 * - editar fechas y notas del cobro, o fecha y notas de un pago;
 * - reasignar el proveedor de un concepto ya pagado (pagos anulados y sin orden).
 */
export async function POST(request: Request) {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido: se esperaba JSON' }, { status: 400 })
  }
  const validation = validate(CorreccionCuentasSchema, body)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

  try {
    const usuario = authResult.session?.user?.email || 'sistema'
    return Response.json({ resultado: await aplicarCorreccion(validation.data, usuario) })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
