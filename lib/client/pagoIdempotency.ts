import { computeClientFileHash, computeClientPayloadHash } from '@/lib/shared/canonicalPayload'
import { clearPendingOperation, createPendingOperation, readPendingOperation } from '@/lib/client/pendingOperation'
import { reconcilePagoEstado, type PagoReconciliationResult } from '@/lib/client/reconcilePago'

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
 *    seguir (se limpia y se reintenta esta misma pasada desde cero, con un
 *    `operationId` NUEVO -- el fingerprint distinto prueba que es una
 *    operación distinta de la que sí completó).
 * 4. Mismo fingerprint -> reutilizar el `operationId` existente
 *    (`reusedExisting`). Fix post-auditoría PR #29: el TTL de
 *    `pendingOperation` (`stale`) es un GATILLO real de reconciliación, no
 *    solo una marca ignorada -- si el registro venció, se reconcilia ANTES
 *    de reenviar aunque el fingerprint sea el mismo:
 *    - `completed` -> el intento anterior YA se aplicó. Se limpia y se
 *      devuelve ESE resultado sin reenviar -- reenviar con un
 *      `operationId` nuevo generaría un pago duplicado real; reenviar con
 *      el mismo ya no tiene nada que confirmar.
 *    - `not_found`/`ambiguous` -> la identidad sigue viva. Se permite
 *      exactamente un retry EXACTO (mismo `operationId`, mismo payload),
 *      nunca una identidad nueva.
 * 5. `normalize()` (comprime el comprobante si aplica) -- ANTES de
 *    persistir, no después. Fix post-auditoría PR #29: `normalize()` es
 *    async y puede tardar segundos (carga de imagen, canvas, encode JPEG);
 *    si `createPendingOperation` corriera antes, un cierre de pestaña o
 *    caída del navegador durante esa ventana dejaría una identidad
 *    persistida sin que ningún request hubiera salido nunca -- y como
 *    `not_found` nunca es terminal (paso 3), un intento posterior con un
 *    payload DISTINTO quedaría bloqueado por esa identidad fantasma hasta
 *    reconciliar. Con `normalize()` primero, `createdNow` no persiste nada
 *    todavía -- un fallo aquí no deja rastro que limpiar: el siguiente
 *    intento simplemente vuelve a ver `none`.
 *    - `reusedExisting` (un intento anterior pudo haber hecho commit) ->
 *      un fallo aquí NO toca el registro (ya existía antes de este
 *      intento, no lo creó este retry).
 * 6. Persistir inmediatamente antes del `fetch`, nunca antes -- solo
 *    cuando la identidad es nueva (`createdNow`).
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
  reconcile?: (dominio: 'cuentas-pagar' | 'cuentas-cobrar', cuentaId: string, operationId: string) => Promise<PagoReconciliationResult>
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

      // TTL como gatillo REAL de reconciliación (fix post-auditoría PR #29):
      // un registro `stale` nunca se reenvía a ciegas, aunque el payload sea
      // idéntico -- puede que el intento original ya haya terminado en el
      // servidor mientras esta pestaña esperaba.
      if (pending.kind === 'stale') {
        const reconciliation = await reconcile(dominio, cuentaId, operationId)
        if (reconciliation.status === 'completed') {
          // Ya se aplicó de verdad -- usar ESE resultado, nunca reenviar:
          // reenviar generaría un `operationId` nuevo en la siguiente
          // vuelta del loop y, con él, un pago duplicado real.
          clearPendingOperation(scope)
          return reconciliation.result
        }
        // not_found/ambiguous: la identidad sigue viva -- se cae al retry
        // EXACTO de abajo (mismo operationId, mismo payload), nunca una
        // identidad nueva.
      }
    } else {
      const reconciliation = await reconcile(dominio, cuentaId, pending.op.operationId)
      if (reconciliation.status === 'completed') {
        clearPendingOperation(scope)
        continue // reintentar esta pasada, ya sin registro pendiente
      }
      throw new Error('Hay un pago pendiente de confirmar. Espera unos segundos e intenta de nuevo.')
    }

    // Fix post-auditoría PR #29: `normalize()` corre ANTES de persistir.
    // Es async y puede tardar (carga de imagen, canvas, encode JPEG) -- si
    // `createPendingOperation` corriera antes, una pestaña cerrada o el
    // navegador cayéndose durante esa ventana dejaría una identidad
    // persistida sin que ningún request hubiera salido nunca. Como
    // `not_found` nunca es terminal, esa identidad fantasma bloquearía un
    // intento posterior con un payload distinto hasta reconciliar -- un
    // problema de liveness real, no de doble cobro (nunca hubo request).
    let normalizedComprobante: File | undefined
    try {
      normalizedComprobante = comprobante ? await normalize(comprobante) : undefined
    } catch (normalizeError) {
      // createdNow: todavía no se persistió nada -- no hay nada que
      // limpiar, el siguiente intento simplemente vuelve a ver `none`.
      // reusedExisting: el registro ya existía antes de este intento (no
      // lo creó este retry) -- un intento anterior (u otro request en
      // vuelo) pudo haber hecho commit, así que tampoco se toca aquí.
      throw normalizeError
    }

    if (origin === 'createdNow') {
      const created = createPendingOperation(scope, fingerprint, operationId)
      if (!created) {
        throw new Error('No se pudo registrar el intento de forma segura. Intenta de nuevo.')
      }
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
