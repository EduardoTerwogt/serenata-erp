import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getProveedorDocumentosMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getProveedorDocumentos: mocks.getProveedorDocumentosMock,
}))

import { GET } from '../proveedores/[id]/documentos/route'

const params = Promise.resolve({ id: 'prov-1' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.getProveedorDocumentosMock.mockResolvedValue([{ id: 'doc-1', proveedor_id: 'prov-1', tipo: 'INE', estado_validacion: 'validado' }])
})

describe('GET /api/proveedores/[id]/documentos', () => {
  it('requiere sección responsables', async () => {
    await GET(new Request('http://x'), { params })
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('responsables')
  })

  it('devuelve los documentos del proveedor', async () => {
    const res = await GET(new Request('http://x'), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documentos).toHaveLength(1)
    expect(mocks.getProveedorDocumentosMock).toHaveBeenCalledWith('prov-1')
  })
})
