/**
 * Canonicalización de payloads para hash de idempotencia (1E-1). Módulo
 * puro, sin dependencias server-only: lo usa `lib/server/idempotency.ts`
 * (Node `crypto`) y, desde 1C-2b, código de cliente (`'use client'`) que
 * necesita el mismo algoritmo con Web Crypto -- nunca importando
 * `lib/server/idempotency.ts`, `supabaseAdmin` ni `server-only`.
 *
 * Ordena las claves de objeto recursivamente en todos los niveles; los
 * arrays NO se reordenan (el orden de un array es parte del significado
 * del payload, p. ej. `items` en un bulk-import).
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export function canonicalizeJson(value: unknown): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item))
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, val]) => [key, canonicalizeJson(val)] as const)
    return Object.fromEntries(entries)
  }
  return value as JsonValue
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Hash del lado del cliente (1C-2b), Web Crypto en vez del `crypto` de Node
 * de `lib/server/idempotency.ts` -- misma canonicalización (`canonicalizeJson`),
 * misma forma de hash (SHA-256, hex). Requiere un contexto seguro
 * (`crypto.subtle`, disponible en HTTPS/localhost); nunca importa
 * `lib/server/idempotency.ts`, `supabaseAdmin` ni `server-only`.
 */
export async function computeClientPayloadHash(payload: unknown): Promise<string> {
  const canonical = canonicalizeJson(payload)
  const encoded = new TextEncoder().encode(JSON.stringify(canonical))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return toHex(digest)
}

/**
 * Hash de los BYTES de un archivo (1E-3b/c): el fingerprint de un intento
 * de pago debe reflejar el comprobante ORIGINAL, antes de normalizar --
 * un cambio de contenido del mismo nombre de archivo debe cambiar el
 * fingerprint. Se combina con el resto de los campos del intento vía
 * `computeClientPayloadHash` (nunca se compara directamente contra un hash
 * calculado en el servidor).
 */
export async function computeClientFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return toHex(digest)
}
