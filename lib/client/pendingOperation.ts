/**
 * Idempotencia del lado del cliente (1E-3b/1E-3c pagos, 1C-2b bulk):
 * registra en `localStorage`, ANTES del primer `fetch` de una operación,
 * la identidad (`operationId`) necesaria para que un retry/timeout/remount/
 * reload la reconozca como la MISMA operación en vez de disparar una
 * segunda.
 *
 * Fail-closed por diseño: si `localStorage` no está disponible, el caller
 * debe rechazar el submit (nunca enviar sin poder registrar la identidad).
 * `unavailable` y `none` son casos distintos a propósito -- `none` autoriza
 * arrancar una operación nueva, `unavailable` nunca.
 *
 * TTL como GATILLO de reconciliación, nunca como expiración silenciosa:
 * pasado el TTL el registro pasa a `stale`, pero sigue bloqueando un
 * payload distinto igual que `fresh` -- el caller debe reconciliar antes
 * de generar una identidad nueva, no ignorar el registro.
 */

const STORAGE_PREFIX = 'pendingOperation:'
const TTL_MS = 60_000

interface PendingOperation<TPayload = undefined> {
  operationId: string
  fingerprint: string
  status: 'pending'
  createdAt: number
  payload?: TPayload
}

export type ReadPendingOperationResult<TPayload> =
  | { kind: 'none' }
  | { kind: 'unavailable' }
  | { kind: 'fresh' | 'stale'; op: PendingOperation<TPayload> }

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`
}

// `window` no existe en SSR/Node -- acceso seguro en vez de referenciarlo
// sin verificar (lo que lanzaría un ReferenceError, no un TypeError
// atrapable, fuera de un componente cliente ya montado en el navegador).
function getLocalStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  return window.localStorage
}

function isStorageAvailable(): boolean {
  try {
    const storage = getLocalStorage()
    if (!storage) return false
    const probeKey = '__pendingOperation_probe__'
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    return true
  } catch {
    return false
  }
}

export function readPendingOperation<TPayload = undefined>(
  scope: string
): ReadPendingOperationResult<TPayload> {
  if (!isStorageAvailable()) return { kind: 'unavailable' }

  const raw = getLocalStorage()!.getItem(storageKey(scope))
  if (!raw) return { kind: 'none' }

  let op: PendingOperation<TPayload>
  try {
    op = JSON.parse(raw)
  } catch {
    // Registro corrupto: fail-closed como 'unavailable', nunca como 'none'
    // -- 'none' autorizaría un envío nuevo sin saber si había algo pendiente.
    return { kind: 'unavailable' }
  }

  const age = Date.now() - op.createdAt
  return { kind: age > TTL_MS ? 'stale' : 'fresh', op }
}

/**
 * Debe llamarse inmediatamente antes del primer `fetch` de la operación,
 * nunca antes -- ver TabRegistrarPago.handleSubmit / handleImportItems.
 */
export function createPendingOperation<TPayload = undefined>(
  scope: string,
  fingerprint: string,
  operationId: string,
  payload?: TPayload
): boolean {
  if (!isStorageAvailable()) return false

  const op: PendingOperation<TPayload> = {
    operationId,
    fingerprint,
    status: 'pending',
    createdAt: Date.now(),
    ...(payload !== undefined ? { payload } : {}),
  }

  try {
    getLocalStorage()!.setItem(storageKey(scope), JSON.stringify(op))
    return true
  } catch {
    return false
  }
}

export function clearPendingOperation(scope: string): void {
  try {
    getLocalStorage()?.removeItem(storageKey(scope))
  } catch {
    // Best-effort: si localStorage no está disponible aquí, tampoco lo
    // estuvo al crear el registro -- createPendingOperation ya habría
    // devuelto false y el caller nunca habría llegado a enviar nada.
  }
}
