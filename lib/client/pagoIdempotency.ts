import { computeClientFileHash, computeClientPayloadHash } from '@/lib/shared/canonicalPayload'
import { clearPendingOperation, createPendingOperation, readPendingOperation } from '@/lib/client/pendingOperation'
import { reconcilePagoEstado, type PagoReconciliationStatus } from '@/lib/client/reconcilePago'

/**
 * Orquestación de idempotencia compartida entre useCuentasPagar y
 * useCuentasCobrar (Engineering Hardening EF-1, 1E-3b/1E-3c). Vive en los
 * hooks -- no en TabRegistrarPago.tsx, que solo llama a
 * `onRegistrarPago(...)` -- porque el fetch real y la generación de
 * identidad ya vivían aquí antes de esta fase.
 *
 * Orden exacto (v13.1 §9, con las precisiones del addendum de ejecución):
 * 1. Fingerprint sobre el comprobante ORIGINAL (bytes) + campos del
 *    formulario, antes de `normalize()`.
 * 2. `readPendingOperation`.
 * 3. Fingerprint distinto a uno pendiente -> bloquear y reconciliar.
 *    `not_found`/`ambiguous` nunca liberan nada; solo `completed` permite
 *    seguir (se limpia y se reintenta esta misma pasada desde cero).
 * 4. Mismo fingerprint -> reutilizar el `operationId` existente
 *    (`reusedExisting`).
 * 5. Persistir inmediatamente antes del primer `fetch`, nunca antes --
 *    solo cuando la identidad es nueva (`createdNow`).
 * 6. `normalize()` (comprime el comprobante si aplica). Un fallo aquí:
 *    - `createdNow` (nunca se envió nada para esta identidad) -> limpiar.
 *    - `reusedExisting` (un intento anterior pudo haber hecho commit) ->
 *      NO limpiar.
 * 7. `submit()` (el fetch real). Éxito -> limpiar. Cualquier error
 *    posterior al fetch -> nunca limpiar, sea cual sea la procedencia.
 */
export interface RunIdempotentPagoSubmitParams<TFields> {
  scope: string
  dominio: 'cuentas-pagar' | 'cuentas-cobrar'
  cuentaId: string
  fields: TFields
  comprobante?: File
  normalize: (file: File) => Promise<File>
  submit: (args: { operationId: string; comprobante?: File }) => Promise<unknown>
  /** Inyectable solo para pruebas -- por default consulta el endpoint real. */
  reconcile?: (dominio: 'cuentas-pagar' | 'cuentas-cobrar', cuentaId: string, operationId: string) => Promise<PagoReconciliationStatus>
}

const MAX_RECONCILE_RETRIES = 2

export async function runIdempotentPagoSubmit<TFields extends Record<string, unknown>>(
  params: RunIdempotentPagoSubmitParams<TFields>
): Promise<unknown> {
  const { scope, dominio, cuentaId, fields, comprobante, normalize, submit } = params
  const reconcile = params.reconcile ?? reconcilePagoEstado

  let attemptsLeft = MAX_RECONCILE_RETRIES
  while (attemptsLeft > 0) {
    attemptsLeft -= 1

    const comprobanteHash = comprobante ? await computeClientFileHash(comprobante) : null
    const fingerprint = await computeClientPayloadHash({
      ...fields,
      comprobanteHash,
      comprobanteNombre: comprobante?.name ?? null,
    })

    const pending = readPendingOperation<never>(scope)

    if (pending.kind === 'unavailable') {
      throw new Error('No se pudo verificar el estado de un intento anterior. Intenta de nuevo.')
    }

    let operationId: string
    let origin: 'createdNow' | 'reusedExisting'

    if (pending.kind === 'none') {
      operationId = crypto.randomUUID()
      origin = 'createdNow'
    } else if (pending.op.fingerprint === fingerprint) {
      operationId = pending.op.operationId
      origin = 'reusedExisting'
    } else {
      const estado = await reconcile(dominio, cuentaId, pending.op.operationId)
      if (estado === 'completed') {
        clearPendingOperation(scope)
        continue // reintentar esta pasada, ya sin registro pendiente
      }
      throw new Error('Hay un pago pendiente de confirmar. Espera unos segundos e intenta de nuevo.')
    }

    if (origin === 'createdNow') {
      const created = createPendingOperation(scope, fingerprint, operationId)
      if (!created) {
        throw new Error('No se pudo registrar el intento de forma segura. Intenta de nuevo.')
      }
    }

    let normalizedComprobante: File | undefined
    try {
      normalizedComprobante = comprobante ? await normalize(comprobante) : undefined
    } catch (normalizeError) {
      if (origin === 'createdNow') {
        // Ningún request salió nunca para esta identidad -- seguro limpiar.
        clearPendingOperation(scope)
      }
      // reusedExisting: un intento anterior (u otro request en vuelo) pudo
      // haber hecho commit -- este fallo local del retry no lo descarta.
      throw normalizeError
    }

    try {
      const result = await submit({ operationId, comprobante: normalizedComprobante })
      clearPendingOperation(scope)
      return result
    } catch (submitError) {
      // El fetch fue intentado -- nunca limpiar, sea cual sea la procedencia.
      throw submitError
    }
  }

  throw new Error('No se pudo completar el pago tras reconciliar un intento anterior. Intenta de nuevo.')
}
