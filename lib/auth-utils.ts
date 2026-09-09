/**
 * Utilidades de autenticación: hashing de passwords con Argon2id
 * (auditoría externa 2026-09-09, Fase 2.3) y verificación retrocompatible
 * de hashes PBKDF2 viejos.
 *
 * Por qué Argon2id y no solo subir las iteraciones de PBKDF2: Argon2id es
 * memory-hard -- un atacante que le robe un hash filtrado no puede
 * paralelizarlo barato en GPU/ASIC como sí puede con PBKDF2, por muchas
 * iteraciones que tenga. Es la recomendación #1 de OWASP cuando está
 * disponible. Se usa `hash-wasm` (WebAssembly puro, sin bindings nativos de
 * Node) para no depender de un runtime específico.
 *
 * Los hashes viejos ("saltHex:hashHex", PBKDF2-SHA256) se siguen
 * verificando -- `needsRehash()` le dice al caller cuándo debe volver a
 * hashear con Argon2id tras un login exitoso (rehash-on-login: nadie se
 * desloguea ni resetea password para migrar).
 */
import { argon2id, argon2Verify } from 'hash-wasm'

const PBKDF2_ITERATIONS = 100_000
const HASH_LENGTH_BITS = 256

// Perfil "mínimo recomendado" de OWASP para Argon2id (~19 MiB) -- pensado
// para correr bien en funciones serverless, no solo en un servidor propio.
const ARGON2_MEMORY_KIB = 19_456
const ARGON2_TIME_COST = 2
const ARGON2_PARALLELISM = 1
const ARGON2_HASH_LENGTH = 32

function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g)
  if (!pairs) throw new Error('Invalid hex string')
  return new Uint8Array(pairs.map(b => parseInt(b, 16)))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function derivePbkdf2Key(password: string, salt: Uint8Array): Promise<Uint8Array> {
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

/** Los hashes Argon2id de hash-wasm vienen en formato PHC: "$argon2id$...". */
function isLegacyPbkdf2Hash(stored: string): boolean {
  return !stored.startsWith('$argon2')
}

/**
 * true si `stored` sigue en el formato PBKDF2 viejo -- el caller debe
 * volver a hashear el password (que ya tiene en texto plano porque el
 * login fue exitoso) con `hashPassword()` y persistir el resultado.
 */
export function needsRehash(stored: string): boolean {
  return isLegacyPbkdf2Hash(stored)
}

/**
 * Hashea un password con Argon2id + salt aleatorio.
 * Retorna el hash en formato PHC ("$argon2id$v=19$m=...,t=...,p=...$salt$hash").
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return argon2id({
    password,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_TIME_COST,
    memorySize: ARGON2_MEMORY_KIB,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: 'encoded',
  })
}

async function verifyLegacyPbkdf2Password(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const salt = hexToBytes(saltHex)
    const derived = await derivePbkdf2Key(password, salt)
    return constantTimeEqual(bytesToHex(derived), hashHex)
  } catch {
    return false
  }
}

/**
 * Verifica un password contra un hash almacenado -- Argon2id (formato PHC)
 * o, retrocompatible, el PBKDF2 viejo ("saltHex:hashHex").
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (isLegacyPbkdf2Hash(stored)) {
    return verifyLegacyPbkdf2Password(password, stored)
  }
  try {
    return await argon2Verify({ password, hash: stored })
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
