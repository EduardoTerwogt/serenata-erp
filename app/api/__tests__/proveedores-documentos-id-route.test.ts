import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getProveedorDocumentosMock: vi.fn(),
  updateProveedorDocumentoMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getProveedorDocumentos: mocks.getProveedorDocumentosMock,
  updateProveedorDocumento: mocks.updateProveedorDocumentoMock,
}))

import { PATCH } from '../proveedores/[id]/documentos/[docId]/route'

const params = Promise.resolve({ id: 'prov-1', docId: 'doc-1' })
const req = (body: unknown) => new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.getProveedorDocumentosMock.mockResolvedValue([{ id: 'doc-1', proveedor_id: 'prov-1', tipo: 'INE', estado_validacion: 'revision' }])
  mocks.updateProveedorDocumentoMock.mockResolvedValue({ id: 'doc-1', estado_validacion: 'validado', detalle_validacion: null })
})

describe('PATCH /api/proveedores/[id]/documentos/[docId]', () => {
  it('requiere sección responsables', async () => {
    await PATCH(req({ estado_validacion: 'validado' }), { params })
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('responsables')
  })

  it('staff corrige la auto-clasificación a validado', async () => {
    const res = await PATCH(req({ estado_validacion: 'validado' }), { params })
    expect(res.status).toBe(200)
    expect(mocks.updateProveedorDocumentoMock).toHaveBeenCalledWith('doc-1', { estado_validacion: 'validado', detalle_validacion: null })
  })

  it('staff marca revision con un motivo -- se guarda el detalle', async () => {
    mocks.updateProveedorDocumentoMock.mockResolvedValue({ id: 'doc-1', estado_validacion: 'revision', detalle_validacion: 'foto borrosa' })
    const res = await PATCH(req({ estado_validacion: 'revision', detalle_validacion: 'foto borrosa' }), { params })
    expect(res.status).toBe(200)
    expect(mocks.updateProveedorDocumentoMock).toHaveBeenCalledWith('doc-1', { estado_validacion: 'revision', detalle_validacion: 'foto borrosa' })
  })

  it('marcar validado limpia cualquier detalle_validacion previo', async () => {
    await PATCH(req({ estado_validacion: 'validado', detalle_validacion: 'esto se ignora' }), { params })
    expect(mocks.updateProveedorDocumentoMock).toHaveBeenCalledWith('doc-1', { estado_validacion: 'validado', detalle_validacion: null })
  })

  it('documento no encontrado para este proveedor -- 404', async () => {
    mocks.getProveedorDocumentosMock.mockResolvedValue([])
    const res = await PATCH(req({ estado_validacion: 'validado' }), { params })
    expect(res.status).toBe(404)
    expect(mocks.updateProveedorDocumentoMock).not.toHaveBeenCalled()
  })

  it('payload inválido -- 400', async () => {
    const res = await PATCH(req({ estado_validacion: 'no_existe' }), { params })
    expect(res.status).toBe(400)
  })
})
