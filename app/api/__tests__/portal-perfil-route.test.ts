import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePortalSessionMock: vi.fn(),
  getProveedorByIdMock: vi.fn(),
  updateProveedorMock: vi.fn(),
}))

vi.mock('@/lib/portal-auth', () => ({
  requirePortalSession: mocks.requirePortalSessionMock,
}))

vi.mock('@/lib/db', () => ({
  getProveedorById: mocks.getProveedorByIdMock,
  updateProveedor: mocks.updateProveedorMock,
}))

import { GET, PATCH } from '../portal/perfil/route'

function req(body: unknown) {
  return new Request('http://localhost/api/portal/perfil', { method: 'PATCH', body: JSON.stringify(body) })
}

describe('GET /api/portal/perfil', () => {
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

  it('retorna el perfil del proveedor, incluido el alias (Bloque 4a)', async () => {
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', nombre: 'Jose', alias: 'Chok', telefono: '555', banco: 'BBVA', clabe: '012', regimen_fiscal: 'fisica' })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ nombre: 'Jose', alias: 'Chok', telefono: '555', banco: 'BBVA', clabe: '012', regimen_fiscal: 'fisica' })
  })

  it('sin alias en el proveedor, responde null (nunca undefined)', async () => {
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', nombre: 'Jose', telefono: '555', banco: 'BBVA', clabe: '012', regimen_fiscal: 'fisica' })

    const response = await GET()

    await expect(response.json()).resolves.toEqual({ nombre: 'Jose', alias: null, telefono: '555', banco: 'BBVA', clabe: '012', regimen_fiscal: 'fisica' })
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

describe('PATCH /api/portal/perfil', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: 'prov-1', response: null })
  })

  it('retorna 401 sin sesión de portal', async () => {
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: null, response: Response.json({ error: 'No autenticado' }, { status: 401 }) })
    const response = await PATCH(req({ nombre: 'Chok' }))
    expect(response.status).toBe(401)
    expect(mocks.updateProveedorMock).not.toHaveBeenCalled()
  })

  it('actualiza el perfil con los campos permitidos', async () => {
    mocks.updateProveedorMock.mockResolvedValue({ id: 'prov-1', nombre: 'Chok', telefono: '555', banco: 'BBVA', clabe: '012', regimen_fiscal: 'fisica' })

    const response = await PATCH(req({ nombre: 'Chok', telefono: '555' }))

    expect(mocks.updateProveedorMock).toHaveBeenCalledWith('prov-1', { nombre: 'Chok', telefono: '555' })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ nombre: 'Chok', alias: null, telefono: '555', banco: 'BBVA', clabe: '012', regimen_fiscal: 'fisica' })
  })

  it('actualiza el alias (Bloque 4a: campo nuevo, no reusa nombre)', async () => {
    mocks.updateProveedorMock.mockResolvedValue({ id: 'prov-1', nombre: 'José Ramírez', alias: 'Chok', telefono: '555', banco: 'BBVA', clabe: '012', regimen_fiscal: 'fisica' })

    const response = await PATCH(req({ alias: 'Chok' }))

    expect(mocks.updateProveedorMock).toHaveBeenCalledWith('prov-1', { alias: 'Chok' })
    await expect(response.json()).resolves.toEqual({ nombre: 'José Ramírez', alias: 'Chok', telefono: '555', banco: 'BBVA', clabe: '012', regimen_fiscal: 'fisica' })
  })

  it('retorna 400 con payload inválido', async () => {
    const response = await PATCH(req({ nombre: '' }))
    expect(response.status).toBe(400)
    expect(mocks.updateProveedorMock).not.toHaveBeenCalled()
  })

  it('EF-3 3D-10: un error inesperado (crudo de Supabase) nunca expone su mensaje real al cliente', async () => {
    mocks.updateProveedorMock.mockRejectedValue(new Error('constraint violation on proveedores'))
    const response = await PATCH(req({ nombre: 'Chok' }))
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain('proveedores')
    expect(body.requestId).toEqual(expect.any(String))
  })
})
