import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * EF-2 1D-3: mismo motivo que clientes-route.test.ts -- se retiró el
 * CacheManager en memoria de este endpoint; dos GETs sucesivos deben
 * llamar a getProveedores() las dos veces.
 */

const mocks = vi.hoisted(() => ({
  requireAnySectionMock: vi.fn(async () => ({ response: null })),
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getProveedoresMock: vi.fn(),
  createProveedorMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireAnySection: mocks.requireAnySectionMock,
  requireSection: mocks.requireSectionMock,
}))
vi.mock('@/lib/db', () => ({
  getProveedores: mocks.getProveedoresMock,
  createProveedor: mocks.createProveedorMock,
}))
import { GET, POST } from '../proveedores/route'

describe('GET /api/proveedores', () => {
  beforeEach(() => {
    mocks.getProveedoresMock.mockReset()
    mocks.createProveedorMock.mockReset()
  })

  it('dos GETs sucesivos llaman a getProveedores() las dos veces (sin caché)', async () => {
    mocks.getProveedoresMock.mockResolvedValue([{ id: 'resp-1', nombre: 'Jane Doe' }])

    const r1 = await GET()
    const r2 = await GET()

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(mocks.getProveedoresMock).toHaveBeenCalledTimes(2)
  })

  it('un POST no deja ningún estado que sirva una respuesta vieja al siguiente GET', async () => {
    mocks.getProveedoresMock.mockResolvedValue([{ id: 'resp-1', nombre: 'Jane Doe' }])
    await GET()

    mocks.getProveedoresMock.mockClear()
    mocks.createProveedorMock.mockResolvedValue({ id: 'resp-2', nombre: 'John Doe' })
    await POST(new Request('http://localhost/api/proveedores', {
      method: 'POST',
      body: JSON.stringify({ nombre: 'John Doe' }),
    }))

    mocks.getProveedoresMock.mockResolvedValue([{ id: 'resp-1', nombre: 'Jane Doe' }, { id: 'resp-2', nombre: 'John Doe' }])
    const response = await GET()

    expect(mocks.getProveedoresMock).toHaveBeenCalled()
    expect(response.status).toBe(200)
  })
})
