import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getDocumentosCuentaPagarGrupoMock: vi.fn(),
  updateDocumentoCuentaPagarMock: vi.fn(),
  marcarGrupoFacturadoMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getDocumentosCuentaPagarGrupo: mocks.getDocumentosCuentaPagarGrupoMock,
  updateDocumentoCuentaPagar: mocks.updateDocumentoCuentaPagarMock,
  marcarGrupoFacturado: mocks.marcarGrupoFacturadoMock,
}))

import { PATCH } from '../cuentas-pagar/grupos/[id]/documentos/[docId]/route'

const params = Promise.resolve({ id: 'grupo-1', docId: 'doc-1' })
const req = (body: unknown) => new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.getDocumentosCuentaPagarGrupoMock.mockResolvedValue([{ id: 'doc-1', grupo_id: 'grupo-1', tipo: 'FACTURA_PROVEEDOR_XML' }])
  mocks.updateDocumentoCuentaPagarMock.mockResolvedValue({ id: 'doc-1', estado_validacion: 'validado' })
})

describe('PATCH /api/cuentas-pagar/grupos/[id]/documentos/[docId]', () => {
  it('marcar validado -- cierra el grupo (marcarGrupoFacturado)', async () => {
    const res = await PATCH(req({ estado_validacion: 'validado' }), { params })
    expect(res.status).toBe(200)
    expect(mocks.marcarGrupoFacturadoMock).toHaveBeenCalledWith('grupo-1')
  })

  it('marcar revision -- NO cierra el grupo', async () => {
    mocks.updateDocumentoCuentaPagarMock.mockResolvedValue({ id: 'doc-1', estado_validacion: 'revision', detalle_validacion: 'no cuadra' })
    const res = await PATCH(req({ estado_validacion: 'revision', detalle_validacion: 'no cuadra' }), { params })
    expect(res.status).toBe(200)
    expect(mocks.marcarGrupoFacturadoMock).not.toHaveBeenCalled()
  })

  it('documento no encontrado en este grupo -- 404', async () => {
    mocks.getDocumentosCuentaPagarGrupoMock.mockResolvedValue([])
    const res = await PATCH(req({ estado_validacion: 'validado' }), { params })
    expect(res.status).toBe(404)
    expect(mocks.marcarGrupoFacturadoMock).not.toHaveBeenCalled()
  })

  it('payload inválido -- 400', async () => {
    const res = await PATCH(req({ estado_validacion: 'no_existe' }), { params })
    expect(res.status).toBe(400)
  })
})
