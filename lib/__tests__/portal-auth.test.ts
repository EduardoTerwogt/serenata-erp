import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('portal-auth -- firma y verificación de token (funciones puras)', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret-para-portal-auth'
  })

  it('firma y verifica una sesión válida', async () => {
    const { signPortalSession, verifyPortalSession } = await import('../portal-auth')
    const token = await signPortalSession('proveedor-123', 0)
    const result = await verifyPortalSession(token)
    expect(result).toEqual({ proveedorId: 'proveedor-123', sessionVersion: 0 })
  })

  it('rechaza un token con firma alterada', async () => {
    const { signPortalSession, verifyPortalSession } = await import('../portal-auth')
    const token = await signPortalSession('proveedor-123', 0)
    const [proveedorId, sessionVersion, exp] = token.split('.')
    const tokenAlterado = `${proveedorId}.${sessionVersion}.${exp}.firmafalsa0000000000000000000000000000000000000000000000000000`
    const result = await verifyPortalSession(tokenAlterado)
    expect(result).toBeNull()
  })

  it('rechaza un token con el proveedorId cambiado (firma ya no coincide)', async () => {
    const { signPortalSession, verifyPortalSession } = await import('../portal-auth')
    const token = await signPortalSession('proveedor-123', 0)
    const [, sessionVersion, exp, signature] = token.split('.')
    const tokenAlterado = `proveedor-999.${sessionVersion}.${exp}.${signature}`
    const result = await verifyPortalSession(tokenAlterado)
    expect(result).toBeNull()
  })

  it('rechaza un token con session_version cambiada (firma ya no coincide)', async () => {
    const { signPortalSession, verifyPortalSession } = await import('../portal-auth')
    const token = await signPortalSession('proveedor-123', 0)
    const [proveedorId, , exp, signature] = token.split('.')
    const tokenAlterado = `${proveedorId}.99.${exp}.${signature}`
    const result = await verifyPortalSession(tokenAlterado)
    expect(result).toBeNull()
  })

  it('rechaza un token expirado', async () => {
    const { signPortalSession, verifyPortalSession } = await import('../portal-auth')
    vi.useFakeTimers()
    try {
      const token = await signPortalSession('proveedor-123', 0)
      vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 8) // 8 días -- la sesión dura 7
      const result = await verifyPortalSession(token)
      expect(result).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rechaza un token malformado', async () => {
    const { verifyPortalSession } = await import('../portal-auth')
    expect(await verifyPortalSession('no-es-un-token-valido')).toBeNull()
    expect(await verifyPortalSession('')).toBeNull()
    expect(await verifyPortalSession('a.b.c')).toBeNull()
  })
})

describe('portal-auth -- requirePortalSession revoca contra el estado real del proveedor (Fase 2.5)', () => {
  const mocks = vi.hoisted(() => ({
    cookieGetMock: vi.fn(),
    getProveedorSessionStateMock: vi.fn(),
  }))

  vi.mock('next/headers', () => ({
    cookies: async () => ({ get: mocks.cookieGetMock }),
  }))

  vi.mock('@/lib/server/repositories/proveedores', () => ({
    getProveedorSessionState: mocks.getProveedorSessionStateMock,
  }))

  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret-para-portal-auth'
    mocks.cookieGetMock.mockReset()
    mocks.getProveedorSessionStateMock.mockReset()
  })

  it('acepta la sesión cuando session_version coincide y el proveedor está activo', async () => {
    const { signPortalSession, requirePortalSession } = await import('../portal-auth')
    const token = await signPortalSession('proveedor-123', 2)
    mocks.cookieGetMock.mockReturnValue({ value: token })
    mocks.getProveedorSessionStateMock.mockResolvedValue({ activo: true, session_version: 2 })

    const result = await requirePortalSession()

    expect(result).toEqual({ proveedorId: 'proveedor-123', response: null })
  })

  it('rechaza la sesión si session_version ya no coincide (password cambiado / fusión de identidad)', async () => {
    const { signPortalSession, requirePortalSession } = await import('../portal-auth')
    const token = await signPortalSession('proveedor-123', 1) // token viejo, firmado con la versión 1
    mocks.cookieGetMock.mockReturnValue({ value: token })
    mocks.getProveedorSessionStateMock.mockResolvedValue({ activo: true, session_version: 2 }) // ya avanzó a 2

    const result = await requirePortalSession()

    expect(result.proveedorId).toBeNull()
    expect(result.response?.status).toBe(401)
  })

  it('rechaza la sesión si el proveedor quedó inactivo, aunque la versión coincida', async () => {
    const { signPortalSession, requirePortalSession } = await import('../portal-auth')
    const token = await signPortalSession('proveedor-123', 0)
    mocks.cookieGetMock.mockReturnValue({ value: token })
    mocks.getProveedorSessionStateMock.mockResolvedValue({ activo: false, session_version: 0 })

    const result = await requirePortalSession()

    expect(result.proveedorId).toBeNull()
    expect(result.response?.status).toBe(401)
  })
})
