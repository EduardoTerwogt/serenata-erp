import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePortalSessionMock: vi.fn(),
  getProveedorDocumentoByIdMock: vi.fn(),
  deleteProveedorDocumentoMock: vi.fn(),
  extractDriveFileIdMock: vi.fn(),
  deleteDriveFileMock: vi.fn(),
}))

vi.mock('@/lib/portal-auth', () => ({
  requirePortalSession: mocks.requirePortalSessionMock,
}))

vi.mock('@/lib/db', () => ({
  getProveedorDocumentoById: mocks.getProveedorDocumentoByIdMock,
  deleteProveedorDocumento: mocks.deleteProveedorDocumentoMock,
}))

vi.mock('@/lib/integrations/google/drive', () => ({
  extractDriveFileId: mocks.extractDriveFileIdMock,
  deleteDriveFile: mocks.deleteDriveFileMock,
}))

import { DELETE } from '../portal/documentos/[id]/route'

function callDelete(id: string) {
  const request = new Request(`http://localhost/api/portal/documentos/${id}`, { method: 'DELETE' })
  return DELETE(request, { params: Promise.resolve({ id }) })
}

describe('DELETE /api/portal/documentos/:id', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: 'prov-1', response: null })
    mocks.getProveedorDocumentoByIdMock.mockResolvedValue({
      id: 'doc-1',
      proveedor_id: 'prov-1',
      tipo: 'INE',
      archivo_url: 'https://drive.google.com/file/d/abc123/view',
      archivo_nombre: 'ine.jpg',
      estado_validacion: 'pendiente',
    })
    mocks.extractDriveFileIdMock.mockReturnValue('abc123')
    mocks.deleteDriveFileMock.mockResolvedValue(undefined)
    mocks.deleteProveedorDocumentoMock.mockResolvedValue(undefined)
  })

  it('borra un documento pendiente: archivo de Drive y fila en la base', async () => {
    const response = await callDelete('doc-1')

    expect(response.status).toBe(200)
    expect(mocks.extractDriveFileIdMock).toHaveBeenCalledWith('https://drive.google.com/file/d/abc123/view')
    expect(mocks.deleteDriveFileMock).toHaveBeenCalledWith('abc123')
    expect(mocks.deleteProveedorDocumentoMock).toHaveBeenCalledWith('doc-1')
  })

  it('borra un documento en revision', async () => {
    mocks.getProveedorDocumentoByIdMock.mockResolvedValue({
      id: 'doc-1', proveedor_id: 'prov-1', tipo: 'INE', archivo_url: 'https://drive.google.com/file/d/abc123/view', archivo_nombre: 'ine.jpg', estado_validacion: 'revision',
    })

    const response = await callDelete('doc-1')
    expect(response.status).toBe(200)
  })

  it('404 si el documento no existe', async () => {
    mocks.getProveedorDocumentoByIdMock.mockResolvedValue(null)

    const response = await callDelete('doc-inexistente')
    expect(response.status).toBe(404)
    expect(mocks.deleteProveedorDocumentoMock).not.toHaveBeenCalled()
  })

  it('404 si el documento es de otro proveedor (nunca revela que existe)', async () => {
    mocks.getProveedorDocumentoByIdMock.mockResolvedValue({
      id: 'doc-1', proveedor_id: 'prov-OTRO', tipo: 'INE', archivo_url: 'https://drive.google.com/file/d/abc123/view', archivo_nombre: 'ine.jpg', estado_validacion: 'pendiente',
    })

    const response = await callDelete('doc-1')
    expect(response.status).toBe(404)
    expect(mocks.deleteProveedorDocumentoMock).not.toHaveBeenCalled()
  })

  // Punto 3: un documento ya validado es un registro de cumplimiento
  // aceptado por staff -- no se borra con un clic del proveedor.
  it('409 si el documento ya está validado -- no se borra', async () => {
    mocks.getProveedorDocumentoByIdMock.mockResolvedValue({
      id: 'doc-1', proveedor_id: 'prov-1', tipo: 'INE', archivo_url: 'https://drive.google.com/file/d/abc123/view', archivo_nombre: 'ine.jpg', estado_validacion: 'validado',
    })

    const response = await callDelete('doc-1')
    expect(response.status).toBe(409)
    expect(mocks.deleteProveedorDocumentoMock).not.toHaveBeenCalled()
    const body = await response.json()
    expect(body.error).toContain('contacta a Serenata')
  })

  it('si Drive falla al borrar, igual borra la fila en la base (best-effort)', async () => {
    mocks.deleteDriveFileMock.mockRejectedValue(new Error('Drive caído'))

    const response = await callDelete('doc-1')
    expect(response.status).toBe(200)
    expect(mocks.deleteProveedorDocumentoMock).toHaveBeenCalledWith('doc-1')
  })

  it('si no se puede extraer el fileId de la URL, no intenta borrar de Drive pero sí borra la fila', async () => {
    mocks.extractDriveFileIdMock.mockReturnValue(null)

    const response = await callDelete('doc-1')
    expect(response.status).toBe(200)
    expect(mocks.deleteDriveFileMock).not.toHaveBeenCalled()
    expect(mocks.deleteProveedorDocumentoMock).toHaveBeenCalledWith('doc-1')
  })
})
