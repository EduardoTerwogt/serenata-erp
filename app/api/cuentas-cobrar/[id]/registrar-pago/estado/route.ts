import { requireSection } from '@/lib/api-auth'
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

    const { data: pagoOp } = await supabaseAdmin
      .from('pago_operations')
      .select('dominio, cuenta_id, result')
      .eq('operation_id', operationId)
      .maybeSingle()

    if (pagoOp) {
      if (pagoOp.dominio !== 'cuentas_cobrar' || pagoOp.cuenta_id !== id) {
        return Response.json({ status: 'not_found' })
      }

      const rpcResult = pagoOp.result as { monto_pagado_total: number; monto_pendiente: number; estado_nuevo: string }
      const result = {
        success: true,
        resumen: {
          monto_pagado_total: rpcResult.monto_pagado_total,
          monto_pendiente: rpcResult.monto_pendiente,
          estado_nuevo: rpcResult.estado_nuevo,
        },
      }

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
