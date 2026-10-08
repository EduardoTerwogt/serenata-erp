import { requireSection } from '@/lib/api-auth'
import { cargarContrapartesPendientes } from '@/lib/server/cuentas/contrapartes'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { CuentasContrapartesQuerySchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'GET /api/cuentas/contrapartes'

/**
 * #131: clientes o proveedores con algo pendiente (`pendiente=factura|complemento|saldo`) o todos los activos
 * (`todos`), con búsqueda por nombre. Alimenta el único desplegable de contraparte de Subir factura, Registrar pago y
 * Estado de cuenta. Solo lee; SQL decide qué cuenta como pendiente.
 */
export async function GET(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  const validation = validate(CuentasContrapartesQuerySchema, Object.fromEntries(new URL(request.url).searchParams.entries()))
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

  try {
    const v = validation.data
    return Response.json(await cargarContrapartesPendientes(v.lado, v.pendiente, v.q || undefined))
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
