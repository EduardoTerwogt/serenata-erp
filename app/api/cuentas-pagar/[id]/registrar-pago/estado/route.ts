import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

/**
 * Endpoint de reconciliación (Engineering Hardening EF-1, 1E-3b). Mismo
 * contrato de 2 resultados que el de bulk: `completed` es terminal;
 * `ambiguous`/`not_found` NO lo son -- el cliente nunca debe interpretarlos
 * como "la operación original no se ejecutará".
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

  const scope = `cuentas-pagar:${id}:registrar-pago`

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

    // idempotency_keys no tiene el resultado final -- pago_operations es la
    // evidencia durable del dominio (1E-3a): si el operation_id está ahí Y
    // pertenece a ESTA cuenta, el pago sí se aplicó.
    const { data: pagoOp } = await supabaseAdmin
      .from('pago_operations')
      .select('dominio, cuenta_id, result')
      .eq('operation_id', operationId)
      .maybeSingle()

    if (pagoOp) {
      if (pagoOp.dominio !== 'cuentas_pagar' || pagoOp.cuenta_id !== id) {
        // Nunca propio: un operation_id de otra cuenta/dominio jamás se
        // reporta como completado para esta.
        return Response.json({ status: 'not_found' })
      }

      const { data: documento } = await supabaseAdmin
        .from('documentos_cuentas_pagar')
        .select('archivo_url')
        .eq('cuentas_pagar_id', id)
        .eq('operation_id', operationId)
        .maybeSingle()

      const rpcResult = pagoOp.result as { monto_pagado_total: number; saldo_pendiente: number; estado_nuevo: string }
      const result = {
        success: true,
        resumen: {
          monto_pagado_total: rpcResult.monto_pagado_total,
          saldo_pendiente: rpcResult.saldo_pendiente,
          estado_nuevo: rpcResult.estado_nuevo,
          comprobante_url: documento?.archivo_url ?? null,
        },
      }

      if (idempotencyRow) {
        // Reparación best-effort del fallo de UPDATE documentado en 1E-1 --
        // nunca bloquea la respuesta si falla.
        supabaseAdmin
          .from('idempotency_keys')
          .update({ status_code: 200, response: result })
          .eq('scope', scope)
          .eq('key', operationId)
          .then(
            () => {},
            (repairError) => console.error('[cuentas-pagar/registrar-pago/estado] No se pudo reparar idempotency_keys:', repairError)
          )
      }

      return Response.json({ status: 'completed', result })
    }

    if (idempotencyRow) {
      return Response.json({ status: 'ambiguous' })
    }

    return Response.json({ status: 'not_found' })
  } catch (error) {
    console.error('[GET /api/cuentas-pagar/:id/registrar-pago/estado]', error)
    return Response.json({ error: 'Error consultando estado de la operación' }, { status: 500 })
  }
}
