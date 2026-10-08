import { requireSection } from '@/lib/api-auth'
import { cuerpoDePago, pagoPorOperacion } from '@/lib/server/cuentas/registrar-pago'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

/**
 * Endpoint de reconciliación (Engineering Hardening EF-1, 1E-3c). Mismo
 * contrato que su equivalente CxP: `completed` es terminal;
 * `ambiguous`/`not_found` NO lo son.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  const { id } = await params
  const url = new URL(request.url)
  const operationId = url.searchParams.get('operation_id')

  if (!operationId) {
    return Response.json({ error: 'operation_id requerido' }, { status: 400 })
  }

  const scope = `cuentas-cobrar:${id}:registrar-pago`

  try {
    const { data: idempotencyRow } = await supabaseAdmin
      .from('idempotency_keys')
      .select('status_code, response')
      .eq('scope', scope)
      .eq('key', operationId)
      .maybeSingle()

    if (idempotencyRow?.status_code != null) {
      return Response.json({ status: 'completed', result: idempotencyRow.response })
    }

    // #123 (T2): la operación es el `operation_id` de la cabecera `pagos`.
    const pago = await pagoPorOperacion('cobro', operationId, id)
    if (pago) {
      const result = cuerpoDePago('cobro', pago.resultado, pago.comprobanteUrl)

      if (idempotencyRow) {
        supabaseAdmin
          .from('idempotency_keys')
          .update({ status_code: 200, response: result })
          .eq('scope', scope)
          .eq('key', operationId)
          .then(
            () => {},
            (repairError) => console.error('[cuentas-cobrar/registrar-pago/estado] No se pudo reparar idempotency_keys:', repairError)
          )
      }

      return Response.json({ status: 'completed', result })
    }

    if (idempotencyRow) {
      return Response.json({ status: 'ambiguous' })
    }

    return Response.json({ status: 'not_found' })
  } catch (error) {
    console.error('[GET /api/cuentas-cobrar/:id/registrar-pago/estado]', error)
    return Response.json({ error: 'Error consultando estado de la operación' }, { status: 500 })
  }
}
