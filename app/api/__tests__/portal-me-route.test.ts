import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePortalSessionMock: vi.fn(),
  getProveedorByIdMock: vi.fn(),
}))

vi.mock('@/lib/portal-auth', () => ({
  requirePortalSession: mocks.requirePortalSessionMock,
}))

vi.mock('@/lib/db', () => ({
  getProveedorById: mocks.getProveedorByIdMock,
}))

import { GET } from '../portal/me/route'

describe('GET /api/portal/me', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: 'prov-1', response: null })
  })

  it('retorna 401 sin sesión de portal', async () => {
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: null, response: Response.json({ error: 'No autenticado' }, { status: 401 }) })
    const response = await GET()
    expect(response.status).toBe(401)
    expect(mocks.getProveedorByIdMock).not.toHaveBeenCalled()
  })

  it('retorna 401 si el proveedor no tiene portal_estado (no es cuenta de portal)', async () => {
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', portal_estado: null })
    const response = await GET()
    expect(response.status).toBe(401)
  })

  it('retorna los datos del proveedor activo sin candidato', async () => {
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', nombre: 'Jose', correo: 'jose@correo.com', portal_estado: 'activo' })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'prov-1', nombre: 'Jose', correo: 'jose@correo.com', portal_estado: 'activo', candidato: null,
    })
  })

  it('incluye el candidato cuando está pendiente de confirmación', async () => {
    mocks.getProveedorByIdMock
      .mockResolvedValueOnce({ id: 'prov-1', nombre: 'Jose', correo: 'jose@correo.com', portal_estado: 'pendiente_confirmacion', match_candidato_id: 'cand-1' })
      .mockResolvedValueOnce({ id: 'cand-1', nombre: 'Antonio Gutierrez' })

    const response = await GET()

    const body = await response.json()
    expect(body.candidato).toEqual({ id: 'cand-1', nombre: 'Antonio Gutierrez' })
  })

  it('no falla si la carga del candidato truena -- lo deja en null', async () => {
    mocks.getProveedorByIdMock
      .mockResolvedValueOnce({ id: 'prov-1', nombre: 'Jose', correo: 'jose@correo.com', portal_estado: 'pendiente_confirmacion', match_candidato_id: 'cand-1' })
      .mockRejectedValueOnce(new Error('boom'))

    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.candidato).toBeNull()
  })

  it('EF-3 3D-10: un error inesperado (crudo de Supabase) nunca expone su mensaje real al cliente', async () => {
    mocks.getProveedorByIdMock.mockRejectedValue(new Error('relation "proveedores" does not exist'))
    const response = await GET()
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain('proveedores')
    expect(body.requestId).toEqual(expect.any(String))
  })
})
