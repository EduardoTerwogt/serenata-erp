import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async (_s: string) => ({ response: null as Response | null })),
  cargarMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/cuentas/estado-cuenta-rpc', () => ({ cargarEstadoCuenta: mocks.cargarMock }))

import { GET } from '../cuentas/estado-cuenta/route'

const ID = '5eedc000-0000-4000-8000-00000000c001'
const req = (qs: string) => new Request(`http://x/api/cuentas/estado-cuenta${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.cargarMock.mockResolvedValue({ lado: 'cobro', contraparte: { id: ID, nombre: 'Cliente', rfc: null }, facturas: [], pagos: [] })
})

describe('GET /api/cuentas/estado-cuenta', () => {
  it('exige la sección cuentas', async () => {
    mocks.requireSectionMock.mockResolvedValueOnce({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    const res = await GET(req(`?lado=cobro&id=${ID}`))
    expect(res.status).toBe(403)
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('cuentas')
    expect(mocks.cargarMock).not.toHaveBeenCalled()
  })

  it('rechaza lado o id inválidos antes de consultar', async () => {
    expect((await GET(req(`?lado=otro&id=${ID}`))).status).toBe(400)
    expect((await GET(req('?lado=cobro&id=no-es-uuid'))).status).toBe(400)
    expect((await GET(req('?lado=cobro'))).status).toBe(400)
    expect(mocks.cargarMock).not.toHaveBeenCalled()
  })

  it('devuelve el estado de cuenta del cliente o proveedor pedido', async () => {
    const res = await GET(req(`?lado=cobro&id=${ID}`))
    expect(res.status).toBe(200)
    expect(mocks.cargarMock).toHaveBeenCalledWith('cobro', ID, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), undefined)
    expect((await res.json()).contraparte.nombre).toBe('Cliente')
  })

  it('con proyectos (#130) limita el estado a esos proyectos', async () => {
    const res = await GET(req(`?lado=proveedor&id=${ID}&proyectos=SH061,SH062`))
    expect(res.status).toBe(200)
    expect(mocks.cargarMock).toHaveBeenCalledWith('proveedor', ID, expect.any(String), ['SH061', 'SH062'])
  })

  it('rechaza más de 50 proyectos', async () => {
    const muchos = Array.from({ length: 51 }, (_, i) => `SH${i}`).join(',')
    expect((await GET(req(`?lado=cobro&id=${ID}&proyectos=${muchos}`))).status).toBe(400)
    expect(mocks.cargarMock).not.toHaveBeenCalled()
  })

  it('una contraparte que no existe responde 404', async () => {
    mocks.cargarMock.mockResolvedValueOnce({ lado: 'proveedor', contraparte: null, facturas: [], pagos: [] })
    const res = await GET(req(`?lado=proveedor&id=${ID}`))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Proveedor no encontrado')
  })

  it('un error de la base no expone su mensaje', async () => {
    mocks.cargarMock.mockRejectedValueOnce(new Error('PGRST: detalle técnico'))
    const res = await GET(req(`?lado=cobro&id=${ID}`))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('PGRST')
  })
})
