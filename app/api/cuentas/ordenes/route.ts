import { requireSection } from '@/lib/api-auth'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { buscarOrdenesCuentas } from '@/lib/server/ordenes-pago/rpc'
import { HistorialOrdenesQuerySchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'GET /api/cuentas/ordenes'

/**
 * Rediseño de Cuentas B6 (D7, D13, D20, S1): historial de órdenes con
 * filtros (estado con "Vencida" derivada, mes, proveedor, proyecto, folio),
 * desglose por proveedor y conteo por estado. El panel "Avisos y órdenes"
 * pide las últimas 5 con esta misma ruta.
 */
export async function GET(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  const params = Object.fromEntries(Array.from(new URL(request.url).searchParams.entries()).filter(([, v]) => v.trim() !== ''))
  const validation = validate(HistorialOrdenesQuerySchema, params)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

  try {
    const { page, page_size, ...filtros } = validation.data
    return Response.json(await buscarOrdenesCuentas(filtros, page, page_size))
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
