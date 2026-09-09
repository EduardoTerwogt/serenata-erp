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
    const response = await POST(req({ confirmar: true }))
    expect(response.status).toBe(401)
    expect(mocks.confirmarMatchMock).not.toHaveBeenCalled()
  })

  it('fusiona hacia el candidato (derivado server-side) y re-firma la sesión cuando confirmar=true', async () => {
    mocks.confirmarMatchMock.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', nombre: 'Antonio Gutierrez', session_version: 1 })

    // El cliente NO manda candidato_id -- lo derivamos server-side dentro de
    // la RPC confirmar_match_proveedor. Un candidato_id en el body, si
    // llegara, se ignora por completo (el schema ya no lo acepta).
    const response = await POST(req({ confirmar: true, candidato_id: 'uuid-de-otro-proveedor-cualquiera' }))

    expect(mocks.confirmarMatchMock).toHaveBeenCalledWith('nuevo-1')
    expect(mocks.setPortalSessionCookieMock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 1)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, proveedor: { id: '11111111-1111-4111-8111-111111111111', nombre: 'Antonio Gutierrez', session_version: 1 } })
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
