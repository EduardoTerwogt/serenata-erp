import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyPasswordMock: vi.fn(),
  needsRehashMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  getProveedorByCorreoMock: vi.fn(),
  updateProveedorMock: vi.fn(),
  setPortalSessionCookieMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}))

vi.mock('@/lib/auth-utils', () => ({
  verifyPassword: mocks.verifyPasswordMock,
  needsRehash: mocks.needsRehashMock,
  hashPassword: mocks.hashPasswordMock,
}))

vi.mock('@/lib/db', () => ({
  getProveedorByCorreo: mocks.getProveedorByCorreoMock,
  updateProveedor: mocks.updateProveedorMock,
}))

vi.mock('@/lib/portal-auth', () => ({
  setPortalSessionCookie: mocks.setPortalSessionCookieMock,
}))

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimitMock,
  getClientIp: () => '127.0.0.1',
}))

import { POST } from '../portal/login/route'

function req(body: unknown) {
  return new Request('http://localhost/api/portal/login', { method: 'POST', body: JSON.stringify(body) })
}

describe('POST /api/portal/login', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.checkRateLimitMock.mockResolvedValue(true)
  })

  it('Fase 2.4 -- 429 si el rate limit por IP o por correo se excede', async () => {
    mocks.checkRateLimitMock.mockResolvedValueOnce(false) // IP
    const response = await POST(req({ correo: 'jose@correo.com', password: 'password123' }))
    expect(response.status).toBe(429)
    expect(mocks.getProveedorByCorreoMock).not.toHaveBeenCalled()
  })

  it('retorna 401 si el correo no tiene cuenta de portal', async () => {
    mocks.getProveedorByCorreoMock.mockResolvedValue(null)
    const response = await POST(req({ correo: 'nadie@correo.com', password: 'password123' }))
    expect(response.status).toBe(401)
  })

  it('retorna 401 si el password no coincide', async () => {
    mocks.getProveedorByCorreoMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'activo', password_hash: 'hash' })
    mocks.verifyPasswordMock.mockResolvedValue(false)
    const response = await POST(req({ correo: 'jose@correo.com', password: 'incorrecto' }))
    expect(response.status).toBe(401)
    expect(mocks.setPortalSessionCookieMock).not.toHaveBeenCalled()
  })

  it('crea la sesión y avisa si sigue pendiente de confirmación', async () => {
    mocks.getProveedorByCorreoMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'pendiente_confirmacion', password_hash: 'hash', session_version: 3 })
    mocks.verifyPasswordMock.mockResolvedValue(true)

    const response = await POST(req({ correo: 'jose@correo.com', password: 'password123' }))

    expect(mocks.setPortalSessionCookieMock).toHaveBeenCalledWith('prov-1', 3)
    await expect(response.json()).resolves.toEqual({ success: true, requiere_confirmacion: true })
  })

  it('login exitoso normal cuando la cuenta ya está activa', async () => {
    mocks.getProveedorByCorreoMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'activo', password_hash: 'hash', session_version: 0 })
    mocks.verifyPasswordMock.mockResolvedValue(true)
    mocks.needsRehashMock.mockReturnValue(false)

    const response = await POST(req({ correo: 'jose@correo.com', password: 'password123' }))

    await expect(response.json()).resolves.toEqual({ success: true, requiere_confirmacion: false })
    expect(mocks.updateProveedorMock).not.toHaveBeenCalled()
  })

  it('re-hashea a Argon2id tras un login exitoso con un hash PBKDF2 viejo (Fase 2.3)', async () => {
    mocks.getProveedorByCorreoMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'activo', password_hash: 'saltHex:hashHex', session_version: 0 })
    mocks.verifyPasswordMock.mockResolvedValue(true)
    mocks.needsRehashMock.mockReturnValue(true)
    mocks.hashPasswordMock.mockResolvedValue('$argon2id$v=19$m=19456,t=2,p=1$salt$hash')

    const response = await POST(req({ correo: 'jose@correo.com', password: 'password123' }))

    expect(mocks.hashPasswordMock).toHaveBeenCalledWith('password123')
    expect(mocks.updateProveedorMock).toHaveBeenCalledWith('prov-1', { password_hash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash' })
    // El rehash nunca bloquea el login, aunque falle.
    expect(response.status).toBe(200)
  })

  it('el login no falla si el rehash-on-login truena', async () => {
    mocks.getProveedorByCorreoMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'activo', password_hash: 'saltHex:hashHex', session_version: 0 })
    mocks.verifyPasswordMock.mockResolvedValue(true)
    mocks.needsRehashMock.mockReturnValue(true)
    mocks.updateProveedorMock.mockRejectedValue(new Error('boom'))

    const response = await POST(req({ correo: 'jose@correo.com', password: 'password123' }))

    expect(response.status).toBe(200)
    expect(mocks.setPortalSessionCookieMock).toHaveBeenCalledWith('prov-1', 0)
  })

  it('EF-3 3D-10: un error inesperado (crudo de Supabase) nunca expone su mensaje real al cliente', async () => {
    mocks.getProveedorByCorreoMock.mockRejectedValue(new Error('relation "proveedores" does not exist'))
    const response = await POST(req({ correo: 'jose@correo.com', password: 'password123' }))
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain('proveedores')
    expect(body.requestId).toEqual(expect.any(String))
  })
})
