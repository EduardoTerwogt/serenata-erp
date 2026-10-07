/**
 * Dominio de la operación. `cuentas-pagos-*` (#123, B4): `POST /api/cuentas/pagos`, un pago de varias líneas por lado;
 * su `cuentaId` no se usa (la operación es la cabecera `pagos`).
 */
export type DominioPago = 'cuentas-cobrar' | 'cuentas-pagar-grupos' | 'cuentas-pagos-cobro' | 'cuentas-pagos-proveedor'

export type PagoReconciliationStatus = 'completed' | 'not_found' | 'ambiguous'

/**
 * `result` solo viene poblado cuando `status === 'completed'` -- el mismo
 * shape que devolvería el POST original (`{success, resumen}`). Permite al
 * caller usar el resultado YA confirmado por el servidor en vez de
 * reenviar (hallazgo de auditoría PR #29: reenviar tras un `completed` con
 * el mismo fingerprint generaría una operación nueva y, con ella, un pago
 * duplicado).
 */
export interface PagoReconciliationResult {
  status: PagoReconciliationStatus
  result?: unknown
}

/**
 * Consulta el endpoint de reconciliación de una operación de pago
 * (1E-3b/c). `not_found`/`ambiguous` NUNCA se interpretan como "la
 * operación original no se ejecutará" -- solo `completed` es terminal
 * (v13.1, corrección de reconciliación, misma regla que el bulk de
 * partidas). Un fallo de red se trata igual que `not_found`: no libera
 * nada.
 */
export async function reconcilePagoEstado(
  dominio: DominioPago,
  cuentaId: string,
  operationId: string
): Promise<PagoReconciliationResult> {
  try {
    // Los grupos de facturación (docs/PLAN.md) viven bajo un sub-recurso de
    // cuentas-pagar, no bajo su propio dominio en la URL.
    const op = `operation_id=${encodeURIComponent(operationId)}`
    const url =
      dominio === 'cuentas-pagos-cobro' || dominio === 'cuentas-pagos-proveedor'
        ? `/api/cuentas/pagos/estado?lado=${dominio === 'cuentas-pagos-cobro' ? 'cobro' : 'proveedor'}&${op}`
        : `${
            dominio === 'cuentas-pagar-grupos'
              ? `/api/cuentas-pagar/grupos/${cuentaId}/registrar-pago/estado`
              : `/api/${dominio}/${cuentaId}/registrar-pago/estado`
          }?${op}`
    const response = await fetch(url)
    const body = await response.json().catch(() => ({}))
    if (response.ok && body?.status === 'completed') return { status: 'completed', result: body.result }
    if (response.ok && body?.status === 'ambiguous') return { status: 'ambiguous' }
    return { status: 'not_found' }
  } catch {
    return { status: 'not_found' }
  }
}
