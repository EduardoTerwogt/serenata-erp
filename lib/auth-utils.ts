/**
 * Utilidades de autenticación usando Web Crypto API (PBKDF2).
 * Compatible con Edge Runtime, Node.js 18+ y navegadores modernos.
 * No depende de módulos Node.js como 'crypto' o 'util'.
 */

const PBKDF2_ITERATIONS = 100_000
const HASH_LENGTH_BITS = 256

function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g)
  if (!pairs) throw new Error('Invalid hex string')
  return new Uint8Array(pairs.map(b => parseInt(b, 16)))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  // Copiar salt a un ArrayBuffer explícito para satisfacer los tipos de Web Crypto API
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    HASH_LENGTH_BITS
  )
  return new Uint8Array(bits)
}

/** Constant-time string comparison to prevent timing attacks */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Hashea un password con PBKDF2 + salt aleatorio.
 * Retorna "saltHex:hashHex".
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await deriveKey(password, salt)
  return `${bytesToHex(salt)}:${bytesToHex(hash)}`
}

/**
 * Verifica un password contra un hash almacenado "saltHex:hashHex".
 * Usa comparación en tiempo constante para evitar timing attacks.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const salt = hexToBytes(saltHex)
    const derived = await deriveKey(password, salt)
    return constantTimeEqual(bytesToHex(derived), hashHex)
  } catch {
    return false
  }
}

export interface AuthUser {
  id: string
  email: string
  passwordHash: string
  name: string
  sections: string[]
}

/**
 * Carga usuarios desde la tabla `usuarios` en Supabase.
 *
 * Auditoría externa 2026-09-09 (Fase 2.1): antes, cualquier falla de Supabase
 * (o la tabla devolviendo 0 filas -- un truncado accidental, una policy mal
 * puesta, un outage) caía en silencio al env var AUTH_USERS, una lista de
 * usuarios completamente distinta y sin auditar. En producción eso ya no
 * pasa: si Supabase falla, el login falla -- no cambia de fuente de
 * identidad sin que nadie se entere. El fallback solo existe para
 * desarrollo/test, detrás de una bandera explícita que no puede quedar
 * activa en producción.
 */
export async function getAuthUsers(): Promise<AuthUser[]> {
  try {
    const { getUsuariosForAuth } = await import('@/lib/server/repositories/usuarios')
    return await getUsuariosForAuth()
  } catch (e) {
    console.error('[auth] Error consultando usuarios en Supabase:', e)

    const fallbackHabilitado = process.env.AUTH_USERS_DEV_FALLBACK === 'true' && process.env.NODE_ENV !== 'production'
    if (!fallbackHabilitado) return []

    const raw = process.env.AUTH_USERS
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed as AuthUser[]
    } catch {
      return []
    }
  }
}
