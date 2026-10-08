import { requireSection } from '@/lib/api-auth'
import { cargarEstadoCuenta } from '@/lib/server/cuentas/estado-cuenta-rpc'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import { EstadoCuentaQuerySchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'GET /api/cuentas/estado-cuenta'

/**
 * #123 (B3, P15): estado de cuenta de un cliente (`lado=cobro`) o de un proveedor (`lado=proveedor`): una sola
 * consulta (`estado_cuenta`) para la ventana de Estado de cuenta, el reparto de Registrar pago y las fichas (P28).
 * Solo lee. Los saldos y estados los decide SQL. `proyectos` (ids separados por coma) lo limita a esos proyectos (#130).
 */
export async function GET(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  const params = Object.fromEntries(new URL(request.url).searchParams.entries())
  const validation = validate(EstadoCuentaQuerySchema, params)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

  try {
    const { lado, id, proyectos } = validation.data
    const estado = await cargarEstadoCuenta(lado, id, hoyCdmx(), proyectos)
    if (!estado.contraparte) {
      return Response.json({ error: lado === 'cobro' ? 'Cliente no encontrado' : 'Proveedor no encontrado' }, { status: 404 })
    }
    return Response.json(estado)
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
