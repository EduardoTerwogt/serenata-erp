import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePortalSessionMock: vi.fn(),
  setPortalSessionCookieMock: vi.fn(),
  confirmarMatchMock: vi.fn(),
  updateProveedorMock: vi.fn(),
}))

vi.mock('@/lib/portal-auth', () => ({
  requirePortalSession: mocks.requirePortalSessionMock,
  setPortalSessionCookie: mocks.setPortalSessionCookieMock,
}))

vi.mock('@/lib/db', () => ({
  confirmarMatch: mocks.confirmarMatchMock,
  updateProveedor: mocks.updateProveedorMock,
}))

import { POST } from '../portal/signup/confirmar/route'

function req(body: unknown) {
  return new Request('http://localhost/api/portal/signup/confirmar', { method: 'POST', body: JSON.stringify(body) })
}

describe('POST /api/portal/signup/confirmar', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: 'nuevo-1', response: null })
  })

  it('retorna 401 sin sesión de portal', async () => {
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: null, response: Response.json({ error: 'No autenticado' }, { status: 401 }) })
    const response = await POST(req({ confirmar: true, candidato_id: '11111111-1111-4111-8111-111111111111' }))
    expect(response.status).toBe(401)
    expect(mocks.confirmarMatchMock).not.toHaveBeenCalled()
  })

  it('fusiona hacia el candidato y re-firma la sesión cuando confirmar=true', async () => {
    mocks.confirmarMatchMock.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', nombre: 'Antonio Gutierrez' })

    const response = await POST(req({ confirmar: true, candidato_id: '11111111-1111-4111-8111-111111111111' }))

    expect(mocks.confirmarMatchMock).toHaveBeenCalledWith('nuevo-1', '11111111-1111-4111-8111-111111111111')
    expect(mocks.setPortalSessionCookieMock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, proveedor: { id: '11111111-1111-4111-8111-111111111111', nombre: 'Antonio Gutierrez' } })
  })

  it('retorna 400 si confirmar=true sin candidato_id', async () => {
    const response = await POST(req({ confirmar: true }))
    expect(response.status).toBe(400)
    expect(mocks.confirmarMatchMock).not.toHaveBeenCalled()
  })

  it('activa la cuenta propia (sin fusión) cuando confirmar=false', async () => {
    mocks.updateProveedorMock.mockResolvedValue({ id: 'nuevo-1', portal_estado: 'activo' })

    const response = await POST(req({ confirmar: false }))

    expect(mocks.updateProveedorMock).toHaveBeenCalledWith('nuevo-1', { portal_estado: 'activo', match_candidato_id: null })
    expect(mocks.confirmarMatchMock).not.toHaveBeenCalled()
    expect(mocks.setPortalSessionCookieMock).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
  })
})
