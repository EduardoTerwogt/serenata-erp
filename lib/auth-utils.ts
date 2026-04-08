import { promisify } from 'util'
import { randomBytes, scrypt, timingSafeEqual } from 'crypto'

const scryptAsync = promisify(scrypt)

/**
 * Hashes a plaintext password using scrypt with a random salt.
 * Returns a string in the format "salt:hash" (both hex-encoded).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${hash.toString('hex')}`
}

/**
 * Verifies a plaintext password against a stored "salt:hash" string.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  try {
    const hashBuffer = Buffer.from(hash, 'hex')
    const derived = (await scryptAsync(password, salt, 64)) as Buffer
    if (derived.length !== hashBuffer.length) return false
    return timingSafeEqual(hashBuffer, derived)
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
 * Loads the user registry from the AUTH_USERS environment variable.
 * Expected format: JSON array of AuthUser objects.
 * Throws a clear error if not configured — never returns an empty auth.
 */
export function getAuthUsers(): AuthUser[] {
  const raw = process.env.AUTH_USERS
  if (!raw) {
    throw new Error(
      'AUTH_USERS environment variable is not set. ' +
      'Configure it in Vercel with a JSON array of users.'
    )
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('AUTH_USERS must be a JSON array')
    return parsed as AuthUser[]
  } catch (e) {
    throw new Error(`AUTH_USERS is not valid JSON: ${e instanceof Error ? e.message : e}`)
  }
}
