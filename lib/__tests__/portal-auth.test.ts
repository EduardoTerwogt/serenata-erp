import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signPortalSession, verifyPortalSession } from '../portal-auth'

describe('portal-auth', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret-para-portal-auth'
  })

  it('firma y verifica una sesión válida', async () => {
    const token = await signPortalSession('proveedor-123')
    const result = await verifyPortalSession(token)
    expect(result).toEqual({ proveedorId: 'proveedor-123' })
  })

  it('rechaza un token con firma alterada', async () => {
    const token = await signPortalSession('proveedor-123')
    const [proveedorId, exp] = token.split('.')
    const tokenAlterado = `${proveedorId}.${exp}.firmafalsa0000000000000000000000000000000000000000000000000000`
    const result = await verifyPortalSession(tokenAlterado)
    expect(result).toBeNull()
  })

  it('rechaza un token con el proveedorId cambiado (firma ya no coincide)', async () => {
    const token = await signPortalSession('proveedor-123')
    const [, exp, signature] = token.split('.')
    const tokenAlterado = `proveedor-999.${exp}.${signature}`
    const result = await verifyPortalSession(tokenAlterado)
    expect(result).toBeNull()
  })

  it('rechaza un token expirado', async () => {
    vi.useFakeTimers()
    try {
      const token = await signPortalSession('proveedor-123')
      vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 61) // 61 días
      const result = await verifyPortalSession(token)
      expect(result).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rechaza un token malformado', async () => {
    expect(await verifyPortalSession('no-es-un-token-valido')).toBeNull()
    expect(await verifyPortalSession('')).toBeNull()
    expect(await verifyPortalSession('a.b')).toBeNull()
  })
})
