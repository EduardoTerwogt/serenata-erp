import { requireSection } from '@/lib/api-auth'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { cancelarOrdenPago } from '@/lib/server/ordenes-pago/rpc'
import { CancelarOrdenSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas/ordenes/:id/cancelar'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Rediseño de Cuentas B6 (D7): cancelar una orden sin pagos. La RPC libera
 * grupos, hijas y sueltas al estado que les toca por su saldo (R6) y
 * conserva el desglose para el historial (S1).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  const { id } = await params
  if (!UUID.test(id)) return Response.json({ error: 'Orden inválida' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido: se esperaba JSON' }, { status: 400 })
  }
  const validation = validate(CancelarOrdenSchema, body)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

  try {
    const resultado = await cancelarOrdenPago(id, validation.data.motivo, authResult.session?.user?.email || 'sistema')
    return Response.json(resultado)
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
