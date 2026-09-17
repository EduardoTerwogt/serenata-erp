import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentaPagarByIdMock: vi.fn(),
  getDocumentosCuentaPagarMock: vi.fn(),
  getOrdenPagoByIdMock: vi.fn(),
  getProveedorByIdMock: vi.fn(),
  getCuentaPagarGrupoByIdMock: vi.fn(),
  getCuentasPagarPorGrupoMock: vi.fn(),
  getDocumentosCuentaPagarGrupoMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentaPagarById: mocks.getCuentaPagarByIdMock,
  getDocumentosCuentaPagar: mocks.getDocumentosCuentaPagarMock,
  getOrdenPagoById: mocks.getOrdenPagoByIdMock,
  getProveedorById: mocks.getProveedorByIdMock,
  getCuentaPagarGrupoById: mocks.getCuentaPagarGrupoByIdMock,
  getCuentasPagarPorGrupo: mocks.getCuentasPagarPorGrupoMock,
  getDocumentosCuentaPagarGrupo: mocks.getDocumentosCuentaPagarGrupoMock,
}))

import { GET } from '../cuentas-pagar/[id]/documentos/route'

const params = Promise.resolve({ id: 'cuenta-1' })
const req = () => new Request('http://x/api/cuentas-pagar/cuenta-1/documentos')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.getOrdenPagoByIdMock.mockResolvedValue(null)
  mocks.getProveedorByIdMock.mockResolvedValue({ regimen_fiscal: 'moral' })
})

describe('GET /api/cuentas-pagar/[id]/documentos', () => {
  it('cuenta no encontrada -- 404', async () => {
    mocks.getCuentaPagarByIdMock.mockResolvedValue(null)
    const res = await GET(req(), { params })
    expect(res.status).toBe(404)
  })

  it('cuenta sin grupo_id -- grupo: null, documentos/resumen a nivel item (comportamiento previo intacto)', async () => {
    mocks.getCuentaPagarByIdMock.mockResolvedValue({ id: 'cuenta-1', grupo_id: null, x_pagar: 1000, monto_pagado: 200, responsable_id: 'prov-1' })
    mocks.getDocumentosCuentaPagarMock.mockResolvedValue([{ id: 'doc-1' }])

    const res = await GET(req(), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.grupo).toBeNull()
    expect(body.documentos).toEqual([{ id: 'doc-1' }])
    expect(body.resumen).toEqual({ monto_pagado: 200, saldo_pendiente: 800 })
    expect(mocks.getCuentaPagarGrupoByIdMock).not.toHaveBeenCalled()
    expect(mocks.getDocumentosCuentaPagarGrupoMock).not.toHaveBeenCalled()
  })

  it('cuenta con grupo_id -- documentos/resumen leídos del grupo, con desglose de items hermanos', async () => {
    mocks.getCuentaPagarByIdMock.mockResolvedValue({ id: 'cuenta-1', grupo_id: 'grupo-1', x_pagar: 100, monto_pagado: 0, responsable_id: 'prov-1' })
    mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue({ id: 'grupo-1', monto_total: 300, monto_pagado: 50, estado: 'FACTURADO' })
    mocks.getDocumentosCuentaPagarGrupoMock.mockResolvedValue([{ id: 'doc-grupo-1' }])
    mocks.getCuentasPagarPorGrupoMock.mockResolvedValue([{ id: 'cuenta-1' }, { id: 'cuenta-2' }])

    const res = await GET(req(), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.grupo).toEqual({ id: 'grupo-1', monto_total: 300, monto_pagado: 50, estado: 'FACTURADO', items: [{ id: 'cuenta-1' }, { id: 'cuenta-2' }] })
    expect(body.documentos).toEqual([{ id: 'doc-grupo-1' }])
    expect(body.resumen).toEqual({ monto_pagado: 50, saldo_pendiente: 250 })
    expect(mocks.getDocumentosCuentaPagarMock).not.toHaveBeenCalled()
  })
})
