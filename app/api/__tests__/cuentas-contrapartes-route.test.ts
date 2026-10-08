import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async (_s: string) => ({ response: null as Response | null })),
  cargarMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/cuentas/contrapartes', () => ({ cargarContrapartesPendientes: mocks.cargarMock }))

import { GET } from '../cuentas/contrapartes/route'

const req = (qs: string) => new Request(`http://x/api/cuentas/contrapartes${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.cargarMock.mockResolvedValue({ total: 0, contrapartes: [] })
})

describe('GET /api/cuentas/contrapartes (#131)', () => {
  it('exige la sección cuentas y no consulta si no hay permiso', async () => {
    mocks.requireSectionMock.mockResolvedValueOnce({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    const res = await GET(req('?lado=cobro&pendiente=saldo'))
    expect(res.status).toBe(403)
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('cuentas')
    expect(mocks.cargarMock).not.toHaveBeenCalled()
  })

  it('valida lado y pendiente antes de consultar', async () => {
    expect((await GET(req('?pendiente=saldo'))).status).toBe(400)
    expect((await GET(req('?lado=otro&pendiente=saldo'))).status).toBe(400)
    expect((await GET(req('?lado=cobro'))).status).toBe(400)
    expect((await GET(req('?lado=cobro&pendiente=nada'))).status).toBe(400)
    expect(mocks.cargarMock).not.toHaveBeenCalled()
  })

  it('pasa lado, pendiente y búsqueda', async () => {
    const res = await GET(req('?lado=proveedor&pendiente=factura&q=Lumin'))
    expect(res.status).toBe(200)
    expect(mocks.cargarMock).toHaveBeenCalledWith('proveedor', 'factura', 'Lumin')
    await GET(req('?lado=cobro&pendiente=todos'))
    expect(mocks.cargarMock).toHaveBeenLastCalledWith('cobro', 'todos', undefined)
  })

  it('un error de la base no expone su mensaje', async () => {
    mocks.cargarMock.mockRejectedValueOnce(new Error('PGRST: detalle técnico'))
    const res = await GET(req('?lado=cobro&pendiente=saldo'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('PGRST')
  })
})
