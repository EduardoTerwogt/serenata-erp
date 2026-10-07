import { requireSection } from '@/lib/api-auth'
import { cuerpoDePago, pagoPorOperacion } from '@/lib/server/cuentas/registrar-pago'
import { PagoEstadoQuerySchema, validate } from '@/lib/validation/schemas'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

/**
 * #123 (B3, T2): reconciliación de `POST /api/cuentas/pagos` (mismo contrato que los `.../registrar-pago/estado` por
 * cuenta): `completed` es terminal; `ambiguous` y `not_found` no. La operación es el `operation_id` de la cabecera
 * `pagos`; `destino` (opcional) exige que el pago cubra esa cuenta o grupo.
 */
export async function GET(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  const params = Object.fromEntries(new URL(request.url).searchParams.entries())
  const validation = validate(PagoEstadoQuerySchema, params)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
  const { lado, operation_id: operationId, destino } = validation.data
  const scope = `cuentas-pagos:${lado}:registrar-pago`

  try {
    const { data: idempotencyRow } = await supabaseAdmin
      .from('idempotency_keys')
      .select('status_code, response')
      .eq('scope', scope)
      .eq('key', operationId)
      .maybeSingle()
    if (idempotencyRow?.status_code != null) return Response.json({ status: 'completed', result: idempotencyRow.response })

    const pago = await pagoPorOperacion(lado, operationId, destino ?? null)
    if (pago) {
      const result = cuerpoDePago(lado, pago.resultado, pago.comprobanteUrl)
      if (idempotencyRow) {
        supabaseAdmin
          .from('idempotency_keys')
          .update({ status_code: 200, response: result })
          .eq('scope', scope)
          .eq('key', operationId)
          .then(
            () => {},
            (repairError) => console.error('[cuentas/pagos/estado] No se pudo reparar idempotency_keys:', repairError)
          )
      }
      return Response.json({ status: 'completed', result })
    }
    return Response.json({ status: idempotencyRow ? 'ambiguous' : 'not_found' })
  } catch (error) {
    console.error('[GET /api/cuentas/pagos/estado]', error)
    return Response.json({ error: 'Error consultando estado de la operación' }, { status: 500 })
  }
}
