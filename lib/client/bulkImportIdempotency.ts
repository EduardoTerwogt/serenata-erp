import { Cotizacion } from '@/lib/types'
import { computeClientPayloadHash } from '@/lib/shared/canonicalPayload'
import { clearPendingOperation, createPendingOperation, readPendingOperation } from '@/lib/client/pendingOperation'

/**
 * Payload canónico completo persistido por `pendingOperation.ts` (1C-2b) --
 * necesario para repetir una importación bulk verbatim en un retry, nunca
 * reconstruido de memoria (los ids ya definitivos importan, no solo los
 * valores de los campos).
 */
export interface BulkImportPayload {
  items: Array<{
    id: string
    categoria: string
    descripcion: string
    cantidad: number
    precio_unitario: number
    importe: number
    responsable_id: string | null
    responsable_nombre: string | null
    x_pagar: number
    margen: number
    orden: number
    notas: string | null
  }>
  reemplazar_ids: Array<{ id: string; revision: number }>
  cotizacionId: string
}

export type BulkReconciliationStatus = 'completed' | 'not_found' | 'ambiguous'

/**
 * `result` solo viene poblado cuando `status === 'completed'` -- mismo
 * shape que devolvería el POST original (`{cotizacion}`). Permite usar el
 * resultado YA confirmado por el servidor en vez de reenviar (hallazgo de
 * auditoría PR #29: reenviar tras un `completed` con el mismo fingerprint
 * generaría una operación nueva y, con ella, partidas duplicadas).
 */
export interface BulkReconciliationResult {
  status: BulkReconciliationStatus
  result?: { cotizacion: Cotizacion }
}

/**
 * Consulta el endpoint de reconciliación del bulk. `not_found`/`ambiguous`
 * NUNCA se interpretan como "la operación original no se ejecutará" --
 * solo `completed` es terminal (v13.1, corrección de reconciliación).
 * Un fallo de red se trata igual que `not_found`: no libera nada.
 */
export async function reconcileBulkImportEstado(cotizacionId: string, operationId: string): Promise<BulkReconciliationResult> {
  try {
    const response = await fetch(
      `/api/cotizaciones/${cotizacionId}/items/bulk/estado?operation_id=${encodeURIComponent(operationId)}`
    )
    const body = await response.json().catch(() => ({}))
    if (response.ok && body?.status === 'completed') return { status: 'completed', result: body.result }
    if (response.ok && body?.status === 'ambiguous') return { status: 'ambiguous' }
    return { status: 'not_found' }
  } catch {
    return { status: 'not_found' }
  }
}

export interface RunIdempotentBulkImportSubmitParams {
  scope: string
  cotizacionId: string
  /**
   * Recalculado en CADA vuelta del loop (a diferencia de pagos, donde
   * `fields`/`comprobante` son fijos): los ids reutilizables y el siguiente
   * `orden` dependen del estado vivo del form, que puede haber cambiado
   * entre una vuelta y la siguiente (p. ej. tras una reconciliación
   * `completed` que libera el registro pendiente).
   */
  buildCandidatePayload: () => BulkImportPayload
  submit: (args: { operationId: string; payload: BulkImportPayload }) => Promise<{ cotizacion?: Cotizacion }>
  /** Inyectable solo para pruebas -- por default consulta el endpoint real. */
  reconcile?: (cotizacionId: string, operationId: string) => Promise<BulkReconciliationResult>
}

const MAX_RECONCILE_RETRIES = 2

/**
 * Orquestación de idempotencia del bulk-import de partidas (Engineering
 * Hardening EF-1, 1C-2b) -- mismo patrón que `runIdempotentPagoSubmit`
 * (1E-3b/c), extraído de `handleImportItems` (page.tsx) para poder probarlo
 * sin montar el componente completo.
 *
 * Orden exacto (v13.1, con las precisiones del addendum de ejecución):
 * 1. Payload candidato + fingerprint.
 * 2. `readPendingOperation`.
 * 3. Fingerprint distinto a uno pendiente -> bloquear y reconciliar.
 *    `not_found`/`ambiguous` nunca liberan nada; solo `completed` permite
 *    seguir (se limpia y se reintenta esta misma pasada desde cero, con un
 *    payload/operationId NUEVOS -- el fingerprint distinto prueba que es
 *    una operación distinta de la que sí completó).
 * 4. Mismo fingerprint -> reutilizar el `operationId` Y el payload
 *    PERSISTIDOS (nunca los recién recalculados, aunque coincidan en
 *    fingerprint -- evita divergencias de ids/revision).
 *    Fix post-auditoría PR #29: el TTL (`stale`) es un GATILLO real de
 *    reconciliación, no solo una marca ignorada -- si el registro venció,
 *    se reconcilia ANTES de reenviar aunque el fingerprint sea el mismo:
 *    - `completed` -> el intento anterior YA se aplicó. Se limpia y se
 *      devuelve ESE resultado sin reenviar -- reenviar generaría partidas
 *      duplicadas.
 *    - `not_found`/`ambiguous` -> la identidad sigue viva. Se permite
 *      exactamente un retry EXACTO (mismo operationId, mismo payload).
 * 5. Persistir inmediatamente antes del primer `fetch`, nunca antes --
 *    solo cuando la identidad es nueva.
 * 6. `submit()` (el fetch real). Cualquier error -> nunca limpiar (el fetch
 *    fue intentado). Fix post-auditoría PR #29 (hallazgo 6): un 2xx que NO
 *    trae el contrato de éxito esperado (`cotizacion`) tampoco limpia --
 *    una respuesta 2xx malformada no es evidencia de que la operación
 *    completó, y limpiar ahí dejaría a un retry posterior generar una
 *    identidad nueva sobre una operación cuyo destino real se desconoce.
 */
export async function runIdempotentBulkImportSubmit(
  params: RunIdempotentBulkImportSubmitParams
): Promise<{ cotizacion: Cotizacion }> {
  const { scope, cotizacionId, buildCandidatePayload, submit } = params
  const reconcile = params.reconcile ?? reconcileBulkImportEstado

  let attemptsLeft = MAX_RECONCILE_RETRIES
  while (attemptsLeft > 0) {
    attemptsLeft -= 1

    const candidatePayload = buildCandidatePayload()
    const fingerprint = await computeClientPayloadHash(candidatePayload)
    const pending = readPendingOperation<BulkImportPayload>(scope)

    if (pending.kind === 'unavailable') {
      throw new Error('No se pudo verificar el estado de una importación anterior. Intenta de nuevo.')
    }

    let operationId: string
    let payloadToSend: BulkImportPayload
    let isNewOperation = false

    if (pending.kind === 'none') {
      operationId = crypto.randomUUID()
      payloadToSend = candidatePayload
      isNewOperation = true
    } else if (pending.op.fingerprint === fingerprint) {
      operationId = pending.op.operationId
      payloadToSend = pending.op.payload ?? candidatePayload

      if (pending.kind === 'stale') {
        const reconciliation = await reconcile(cotizacionId, operationId)
        if (reconciliation.status === 'completed') {
          clearPendingOperation(scope)
          if (reconciliation.result) return reconciliation.result
          throw new Error('Respuesta inválida al reconciliar una importación de partidas ya confirmada')
        }
        // not_found/ambiguous: la identidad sigue viva -- se cae al retry
        // EXACTO de abajo (mismo operationId, mismo payload persistido).
      }
    } else {
      const reconciliation = await reconcile(cotizacionId, pending.op.operationId)
      if (reconciliation.status === 'completed') {
        clearPendingOperation(scope)
        continue // reintentar esta pasada, ya sin registro pendiente
      }
      throw new Error('Hay una importación de partidas pendiente de confirmar. Espera unos segundos e intenta de nuevo.')
    }

    if (isNewOperation) {
      const created = createPendingOperation(scope, fingerprint, operationId, payloadToSend)
      if (!created) {
        throw new Error('No se pudo registrar la importación de forma segura. Intenta de nuevo.')
      }
    }

    let response: { cotizacion?: Cotizacion }
    try {
      response = await submit({ operationId, payload: payloadToSend })
    } catch (fetchError) {
      // El fetch fue intentado -- nunca limpiar. El registro permanece
      // pendiente hasta éxito confirmado o reconciliación `completed`.
      throw fetchError
    }

    // Hallazgo de auditoría PR #29: no limpiar hasta confirmar que el 2xx
    // trae el contrato de éxito esperado -- un 2xx sin `cotizacion` no es
    // evidencia de que la operación completó.
    if (!response?.cotizacion) {
      throw new Error('Respuesta inválida al copiar partidas')
    }

    clearPendingOperation(scope)
    return { cotizacion: response.cotizacion }
  }

  throw new Error('No se pudo completar la importación tras reconciliar un intento anterior. Intenta de nuevo.')
}
