import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePortalSessionMock: vi.fn(),
  createProveedorDocumentoMock: vi.fn(),
  getProveedorDocumentosMock: vi.fn(),
  getProveedorByIdMock: vi.fn(),
  buscarCandidatosMatchMock: vi.fn(),
  updateProveedorMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
  extraerDatosIdentidadMock: vi.fn(),
}))

vi.mock('@/lib/portal-auth', () => ({
  requirePortalSession: mocks.requirePortalSessionMock,
}))

vi.mock('@/lib/db', () => ({
  createProveedorDocumento: mocks.createProveedorDocumentoMock,
  getProveedorDocumentos: mocks.getProveedorDocumentosMock,
  getProveedorById: mocks.getProveedorByIdMock,
  buscarCandidatosMatch: mocks.buscarCandidatosMatchMock,
  updateProveedor: mocks.updateProveedorMock,
}))

vi.mock('@/lib/integrations/google/drive', () => ({
  uploadFileToDrive: mocks.uploadFileToDriveMock,
}))

vi.mock('@/lib/integrations/google/env', () => ({
  getGoogleEnv: mocks.getGoogleEnvMock,
}))

vi.mock('@/lib/server/portal/document-parser', () => ({
  extraerDatosIdentidad: mocks.extraerDatosIdentidadMock,
}))

import { POST } from '../portal/documentos/route'

function buildRequest(tipo: string, file: File | null = new File(['contenido'], 'doc.jpg', { type: 'image/jpeg' })) {
  const formData = new FormData()
  formData.set('tipo', tipo)
  if (file) formData.set('archivo', file)
  return new Request('http://localhost/api/portal/documentos', { method: 'POST', body: formData })
}

describe('POST /api/portal/documentos', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: 'prov-1', response: null })
    mocks.getGoogleEnvMock.mockReturnValue({ driveFolderId: 'root-folder' })
    mocks.uploadFileToDriveMock.mockResolvedValue('https://drive.google.com/file')
    mocks.createProveedorDocumentoMock.mockResolvedValue({ id: 'doc-1' })
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'activo' })
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: null, regimen_fiscal: null })
    mocks.buscarCandidatosMatchMock.mockResolvedValue([])
  })

  it('sube un comprobante de domicilio sin disparar matching', async () => {
    const response = await POST(buildRequest('COMPROBANTE_DOMICILIO'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ success: true, documento: { id: 'doc-1' }, requiere_confirmacion: false })
    expect(mocks.extraerDatosIdentidadMock).not.toHaveBeenCalled()
    expect(mocks.buscarCandidatosMatchMock).not.toHaveBeenCalled()
  })

  it('sube el INE y dispara matching -- sin candidatos, se queda activo', async () => {
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: 'Jose Gutierrez', regimen_fiscal: null })
    mocks.buscarCandidatosMatchMock.mockResolvedValue([])

    const response = await POST(buildRequest('INE'))

    const body = await response.json()
    expect(body.requiere_confirmacion).toBe(false)
    expect(mocks.buscarCandidatosMatchMock).toHaveBeenCalledWith('Jose Gutierrez', 'prov-1')
    expect(mocks.updateProveedorMock).not.toHaveBeenCalled()
  })

  it('sube el INE y encuentra un candidato -- marca pendiente_confirmacion', async () => {
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: 'Jose Antonio Gutierrez Hernandez', regimen_fiscal: null })
    mocks.buscarCandidatosMatchMock.mockResolvedValue([{ id: 'cand-1', nombre: 'Antonio Gutierrez', score: 0.5 }])

    const response = await POST(buildRequest('INE'))

    const body = await response.json()
    expect(body.requiere_confirmacion).toBe(true)
    expect(mocks.updateProveedorMock).toHaveBeenCalledWith('prov-1', {
      portal_estado: 'pendiente_confirmacion',
      match_candidato_id: 'cand-1',
    })
  })

  // Bug real (2026-09-20): antes, subir la Constancia de Situación Fiscal
  // también disparaba matching -- hay proveedores que facturan por medio de
  // terceros, así que el nombre_completo de la constancia (el del tercero,
  // no el del colaborador real) fusionaba o pedía confirmar la cuenta
  // equivocada. La identidad solo se valida con INE.
  it('sube la constancia y encuentra un candidato por nombre -- NO dispara matching, sigue activo', async () => {
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: 'Jose Antonio Gutierrez Hernandez', regimen_fiscal: 'fisica' })
    mocks.buscarCandidatosMatchMock.mockResolvedValue([{ id: 'cand-1', nombre: 'Antonio Gutierrez', score: 0.5 }])

    const response = await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

    const body = await response.json()
    expect(body.requiere_confirmacion).toBe(false)
    expect(mocks.buscarCandidatosMatchMock).not.toHaveBeenCalled()
    expect(mocks.updateProveedorMock).not.toHaveBeenCalledWith('prov-1', expect.objectContaining({ portal_estado: 'pendiente_confirmacion' }))
  })

  it('sube la constancia y persiste regimen_fiscal cuando el proveedor todavía no tiene uno asignado', async () => {
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'activo', regimen_fiscal: null })
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: null, regimen_fiscal: 'moral' })

    await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

    expect(mocks.updateProveedorMock).toHaveBeenCalledWith('prov-1', { regimen_fiscal: 'moral' })
  })

  it('nunca pisa un regimen_fiscal que staff ya asignó a mano', async () => {
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'activo', regimen_fiscal: 'moral' })
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: null, regimen_fiscal: 'fisica' })

    await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

    expect(mocks.updateProveedorMock).not.toHaveBeenCalledWith('prov-1', expect.objectContaining({ regimen_fiscal: expect.anything() }))
  })

  it('constancia sin régimen fiscal legible -- no llama a updateProveedor por eso', async () => {
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'activo', regimen_fiscal: null })
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: null, regimen_fiscal: null })

    await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

    expect(mocks.updateProveedorMock).not.toHaveBeenCalled()
  })

  it('la extracción de la constancia corre aunque el proveedor no esté activo, para capturar regimen_fiscal (sin disparar matching)', async () => {
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'pendiente_confirmacion', regimen_fiscal: null })
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: 'Jose Gutierrez', regimen_fiscal: 'fisica' })

    await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

    expect(mocks.extraerDatosIdentidadMock).toHaveBeenCalled()
    expect(mocks.buscarCandidatosMatchMock).not.toHaveBeenCalled()
    expect(mocks.updateProveedorMock).toHaveBeenCalledWith('prov-1', { regimen_fiscal: 'fisica' })
  })

  it('no dispara matching si Claude no pudo leer el nombre', async () => {
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: null, regimen_fiscal: null })

    await POST(buildRequest('INE'))

    expect(mocks.buscarCandidatosMatchMock).not.toHaveBeenCalled()
  })

  it('no vuelve a disparar matching si el proveedor ya no está activo (pendiente o ya fusionado)', async () => {
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'pendiente_confirmacion' })
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: 'Jose Gutierrez', regimen_fiscal: null })

    await POST(buildRequest('INE'))

    expect(mocks.extraerDatosIdentidadMock).not.toHaveBeenCalled()
    expect(mocks.buscarCandidatosMatchMock).not.toHaveBeenCalled()
  })

  it('retorna 400 con tipo de documento inválido', async () => {
    const response = await POST(buildRequest('OTRO_TIPO'))
    expect(response.status).toBe(400)
  })

  it('retorna 400 sin archivo', async () => {
    const response = await POST(buildRequest('INE', null))
    expect(response.status).toBe(400)
  })

  it('EF-3 3D-10: un error inesperado (crudo de Supabase) nunca expone su mensaje real al cliente', async () => {
    mocks.createProveedorDocumentoMock.mockRejectedValue(new Error('relation "proveedor_documentos" does not exist'))
    const response = await POST(buildRequest('COMPROBANTE_DOMICILIO'))
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain('proveedor_documentos')
    expect(body.requestId).toEqual(expect.any(String))
  })
})
