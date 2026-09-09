import { describe, expect, it } from 'vitest'
import { hashPassword, needsRehash, verifyPassword } from '../auth-utils'

describe('auth-utils -- Argon2id + retrocompatibilidad PBKDF2 (Fase 2.3)', () => {
  it('hashea con Argon2id (formato PHC) y verifica correctamente', async () => {
    const hash = await hashPassword('password123')

    expect(hash.startsWith('$argon2id$')).toBe(true)
    await expect(verifyPassword('password123', hash)).resolves.toBe(true)
    await expect(verifyPassword('incorrecto', hash)).resolves.toBe(false)
  })

  it('needsRehash es false para un hash Argon2id nuevo', async () => {
    const hash = await hashPassword('password123')
    expect(needsRehash(hash)).toBe(false)
  })

  it('sigue verificando un hash PBKDF2 viejo ("saltHex:hashHex") -- fixture real de "password123"', async () => {
    // Generado con el algoritmo viejo (PBKDF2-SHA256, 100k iteraciones, salt
    // fijo 00..0f) para "password123" -- reproducible con Web Crypto directo,
    // sin pasar por hashPassword (que ya solo produce Argon2id).
    const legacyHash = '000102030405060708090a0b0c0d0e0f:43ed94b665686e9ca6f2e13a8dd27bd5a7bc585e2607789f1dc9ab9a416de21a'

    expect(needsRehash(legacyHash)).toBe(true)
    await expect(verifyPassword('password123', legacyHash)).resolves.toBe(true)
    await expect(verifyPassword('incorrecto', legacyHash)).resolves.toBe(false)
  })

  it('verifyPassword retorna false ante un hash corrupto o vacío, sin tronar', async () => {
    await expect(verifyPassword('password123', '')).resolves.toBe(false)
    await expect(verifyPassword('password123', 'basura-sin-formato')).resolves.toBe(false)
    await expect(verifyPassword('password123', '$argon2id$formato-roto')).resolves.toBe(false)
  })
})
