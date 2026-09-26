import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getDocumentosCuentaPagarGrupoMock: vi.fn(),
  updateDocumentoCuentaPagarMock: vi.fn(),
  validarFacturaProveedorMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getDocumentosCuentaPagarGrupo: mocks.getDocumentosCuentaPagarGrupoMock,
  updateDocumentoCuentaPagar: mocks.updateDocumentoCuentaPagarMock,
  validarFacturaProveedor: mocks.validarFacturaProveedorMock,
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
  it('B2 (V3): marcar validado un XML -- lo valida la RPC (snapshot + FACTURADO), no un UPDATE suelto', async () => {
    mocks.validarFacturaProveedorMock.mockResolvedValue({ documento_id: 'doc-1', estado: 'FACTURADO' })
    const res = await PATCH(req({ estado_validacion: 'validado' }), { params })
    expect(res.status).toBe(200)
    expect(mocks.validarFacturaProveedorMock).toHaveBeenCalledWith('doc-1', null)
    expect(mocks.updateDocumentoCuentaPagarMock).not.toHaveBeenCalled()
  })

  it('B2: marcar validado un PDF -- UPDATE normal, sin tocar el grupo (D25: solo cuenta el XML)', async () => {
    mocks.getDocumentosCuentaPagarGrupoMock.mockResolvedValue([{ id: 'doc-1', grupo_id: 'grupo-1', tipo: 'FACTURA_PROVEEDOR' }])
    const res = await PATCH(req({ estado_validacion: 'validado' }), { params })
    expect(res.status).toBe(200)
    expect(mocks.updateDocumentoCuentaPagarMock).toHaveBeenCalled()
    expect(mocks.validarFacturaProveedorMock).not.toHaveBeenCalled()
  })

  it('marcar revision -- NO cierra el grupo', async () => {
    mocks.updateDocumentoCuentaPagarMock.mockResolvedValue({ id: 'doc-1', estado_validacion: 'revision', detalle_validacion: 'no cuadra' })
    const res = await PATCH(req({ estado_validacion: 'revision', detalle_validacion: 'no cuadra' }), { params })
    expect(res.status).toBe(200)
    expect(mocks.validarFacturaProveedorMock).not.toHaveBeenCalled()
  })

  it('documento no encontrado en este grupo -- 404', async () => {
    mocks.getDocumentosCuentaPagarGrupoMock.mockResolvedValue([])
    const res = await PATCH(req({ estado_validacion: 'validado' }), { params })
    expect(res.status).toBe(404)
    expect(mocks.validarFacturaProveedorMock).not.toHaveBeenCalled()
  })

  it('payload inválido -- 400', async () => {
    const res = await PATCH(req({ estado_validacion: 'no_existe' }), { params })
    expect(res.status).toBe(400)
  })
})
