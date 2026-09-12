export type PagoReconciliationStatus = 'completed' | 'not_found' | 'ambiguous'

/**
 * Consulta el endpoint de reconciliación de una operación de pago
 * (1E-3b/c). `not_found`/`ambiguous` NUNCA se interpretan como "la
 * operación original no se ejecutará" -- solo `completed` es terminal
 * (v13.1, corrección de reconciliación, misma regla que el bulk de
 * partidas). Un fallo de red se trata igual que `not_found`: no libera
 * nada.
 */
export async function reconcilePagoEstado(
  dominio: 'cuentas-pagar' | 'cuentas-cobrar',
  cuentaId: string,
  operationId: string
): Promise<PagoReconciliationStatus> {
  try {
    const response = await fetch(
      `/api/${dominio}/${cuentaId}/registrar-pago/estado?operation_id=${encodeURIComponent(operationId)}`
    )
    const body = await response.json().catch(() => ({}))
    if (response.ok && body?.status === 'completed') return 'completed'
    if (response.ok && body?.status === 'ambiguous') return 'ambiguous'
    return 'not_found'
  } catch {
    return 'not_found'
  }
}
