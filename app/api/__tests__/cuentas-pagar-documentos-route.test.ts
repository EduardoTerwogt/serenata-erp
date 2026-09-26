import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  cargarDetallePagoMock: vi.fn(),
  cargarDetalleCobroMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/cuentas/subir-archivo', () => ({ subirArchivoCuenta: vi.fn() }))
vi.mock('@/lib/server/cuentas/detalle', () => ({ cargarDetallePago: mocks.cargarDetallePagoMock, cargarDetalleCobro: mocks.cargarDetalleCobroMock }))

import { GET as getSuelta } from '../cuentas-pagar/[id]/documentos/route'
import { GET as getGrupo } from '../cuentas-pagar/grupos/[id]/documentos/route'
import { GET as getCobro } from '../cuentas-cobrar/[id]/documentos/route'

const req = () => new Request('http://x')
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
})

describe('GET de detalle (Rediseño de Cuentas B5, U2)', () => {
  it('suelta: pide el detalle de la cuenta y responde { detalle }', async () => {
    mocks.cargarDetallePagoMock.mockResolvedValue({ tipo: 'pago', objetivo: 'cuenta', id: 'cp-1' })
    const res = await getSuelta(req(), params('cp-1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ detalle: { tipo: 'pago', objetivo: 'cuenta', id: 'cp-1' } })
    expect(mocks.cargarDetallePagoMock).toHaveBeenCalledWith('cuenta', 'cp-1')
  })

  it('grupo: pide el detalle del grupo', async () => {
    mocks.cargarDetallePagoMock.mockResolvedValue({ tipo: 'pago', objetivo: 'grupo', id: 'g-1' })
    const res = await getGrupo(req(), params('g-1'))
    expect(res.status).toBe(200)
    expect(mocks.cargarDetallePagoMock).toHaveBeenCalledWith('grupo', 'g-1')
  })

  it('no encontrado → 404 en los tres', async () => {
    mocks.cargarDetallePagoMock.mockResolvedValue(null)
    mocks.cargarDetalleCobroMock.mockResolvedValue(null)
    expect((await getSuelta(req(), params('x'))).status).toBe(404)
    expect((await getGrupo(req(), params('x'))).status).toBe(404)
    expect((await getCobro(req(), params('x'))).status).toBe(404)
  })

  it('sin la sección cuentas no llega a la BD', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: new Response(null, { status: 403 }) } as never)
    expect((await getGrupo(req(), params('g-1'))).status).toBe(403)
    expect(mocks.cargarDetallePagoMock).not.toHaveBeenCalled()
  })
})
