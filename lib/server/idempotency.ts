import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { canonicalizeJson } from '@/lib/shared/canonicalPayload'

/**
 * Auditoría externa 2026-09-09 (Fase 3.3). Envuelve una operación mutante
 * con protección contra doble ejecución: si ya se guardó una respuesta para
 * `(scope, key)`, la retorna sin volver a correr `handler`. Si dos requests
 * con la misma key llegan casi al mismo tiempo, el INSERT (llave primaria)
 * hace que solo una gane la carrera -- la otra espera el resultado.
 *
 * Sin `key` (cliente viejo, o un caller que no manda una), se comporta como
 * antes: corre `handler` sin protección.
 *
 * Engineering Hardening EF-1, 1E-1 (hallazgo C4): la versión anterior
 * trataba CUALQUIER error de INSERT como "ya existe, es un duplicado" --
 * un error real de conexión/permisos entraba al mismo camino de espera en
 * vez de propagarse. Ahora solo `23505` (unique_violation de Postgres,
 * la key ya existe) entra al camino de duplicado/espera; cualquier otro
 * error de INSERT se relanza tal cual.
 */
export interface IdempotentResult {
  status: number
  body: unknown
}

export interface WithIdempotencyOptions {
  /** Hash canónico del payload de esta operación (ver computePayloadHash). */
  payloadHash?: string
}

const POLL_ATTEMPTS = 15
const POLL_INTERVAL_MS = 300

export async function withIdempotency(
  scope: string,
  key: string | null | undefined,
  handler: () => Promise<IdempotentResult>,
  options?: WithIdempotencyOptions
): Promise<IdempotentResult> {
  if (!key) return handler()

  const payloadHash = options?.payloadHash ?? null

  const { error: insertError } = await supabaseAdmin
    .from('idempotency_keys')
    .insert({ scope, key, payload_hash: payloadHash })

  if (insertError) {
    if (insertError.code !== '23505') {
      // No es "la key ya existe" -- es un fallo real (conexión, permisos,
      // etc.). Propagarlo: tratarlo como duplicado ocultaría un error real
      // detrás de un mensaje de "espera y reintenta".
      throw insertError
    }

    // Ya existe una fila para esta key -- alguien más (u otra pestaña) ya
    // la está procesando o ya terminó. Esperar el resultado guardado.
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      const { data } = await supabaseAdmin
        .from('idempotency_keys')
        .select('status_code, response, payload_hash')
        .eq('scope', scope)
        .eq('key', key)
        .maybeSingle()

      if (data?.status_code != null) {
        // Completada: reproduce el resultado guardado sin comparar hash --
        // una vez terminada, la respuesta persistida ya es la fuente de
        // verdad, sin importar qué payload_hash tenga esta request.
        return { status: data.status_code, body: data.response }
      }

      if (payloadHash && data?.payload_hash && data.payload_hash !== payloadHash) {
        // Pendiente con un payload_hash distinto: no es un retry seguro de
        // la misma operación -- fail-closed en vez de esperar y devolver
        // (o pisar) el resultado de una operación ajena bajo esta misma key.
        throw new Error(
          `Conflicto de idempotencia: la key "${key}" en scope "${scope}" ya tiene una operación pendiente con un payload distinto.`
        )
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    throw new Error('Esta operación ya se está procesando. Espera unos segundos y revisa antes de reintentar.')
  }

  try {
    const result = await handler()
    const { error: updateError } = await supabaseAdmin
      .from('idempotency_keys')
      .update({ status_code: result.status, response: result.body })
      .eq('scope', scope)
      .eq('key', key)
    if (updateError) {
      // La request actual igual recibe `result` -- pero la fila queda
      // pendiente indefinidamente (status_code sigue NULL). No es un error
      // fatal de esta request: se loguea sin relanzar. La recuperación vía
      // reconciliación real depende de la tabla durable del dominio
      // (pago_operations/bulk_import_operations, 1C-2/1E-3), no de que
      // este UPDATE haya tenido éxito.
      console.error(
        `[idempotency] No se pudo guardar el resultado final de (${scope}, ${key}):`,
        updateError
      )
    }
    return result
  } catch (e) {
    // La operación falló de verdad -- liberar la key para que un reintento
    // real (no un duplicado) pueda volver a intentarlo.
    await supabaseAdmin.from('idempotency_keys').delete().eq('scope', scope).eq('key', key)
    throw e
  }
}

/**
 * Hash canónico de un payload para detectar, dentro de `withIdempotency`,
 * si dos requests con la misma (scope, key) llevan el mismo payload (retry
 * legítimo) o uno distinto (conflicto real). Reutiliza `canonicalizeJson`
 * de `lib/shared/canonicalPayload.ts` -- la misma canonicalización que
 * usará el cliente en 1C-2b, solo que aquí con `crypto` de Node en vez de
 * Web Crypto.
 */
export function computePayloadHash(payload: unknown): string {
  const canonical = canonicalizeJson(payload)
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}
