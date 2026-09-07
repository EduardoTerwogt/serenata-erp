import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyPasswordMock: vi.fn(),
  getProveedorByCorreoMock: vi.fn(),
  setPortalSessionCookieMock: vi.fn(),
}))

vi.mock('@/lib/auth-utils', () => ({
  verifyPassword: mocks.verifyPasswordMock,
}))

vi.mock('@/lib/db', () => ({
  getProveedorByCorreo: mocks.getProveedorByCorreoMock,
}))

vi.mock('@/lib/portal-auth', () => ({
  setPortalSessionCookie: mocks.setPortalSessionCookieMock,
}))

import { POST } from '../portal/login/route'

function req(body: unknown) {
  return new Request('http://localhost/api/portal/login', { method: 'POST', body: JSON.stringify(body) })
}

describe('POST /api/portal/login', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
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
    mocks.getProveedorByCorreoMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'pendiente_confirmacion', password_hash: 'hash' })
    mocks.verifyPasswordMock.mockResolvedValue(true)

    const response = await POST(req({ correo: 'jose@correo.com', password: 'password123' }))

    expect(mocks.setPortalSessionCookieMock).toHaveBeenCalledWith('prov-1')
    await expect(response.json()).resolves.toEqual({ success: true, requiere_confirmacion: true })
  })

  it('login exitoso normal cuando la cuenta ya está activa', async () => {
    mocks.getProveedorByCorreoMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'activo', password_hash: 'hash' })
    mocks.verifyPasswordMock.mockResolvedValue(true)

    const response = await POST(req({ correo: 'jose@correo.com', password: 'password123' }))

    await expect(response.json()).resolves.toEqual({ success: true, requiere_confirmacion: false })
  })
})
