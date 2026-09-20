import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePortalSessionMock: vi.fn(),
  createProveedorDocumentoMock: vi.fn(),
  getProveedorDocumentosMock: vi.fn(),
  getProveedorByIdMock: vi.fn(),
  buscarCandidatosMatchMock: vi.fn(),
  updateProveedorMock: vi.fn(),
  deleteProveedorDocumentoMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  extractDriveFileIdMock: vi.fn(),
  deleteDriveFileMock: vi.fn(),
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
  deleteProveedorDocumento: mocks.deleteProveedorDocumentoMock,
}))

vi.mock('@/lib/integrations/google/drive', () => ({
  uploadFileToDrive: mocks.uploadFileToDriveMock,
  extractDriveFileId: mocks.extractDriveFileIdMock,
  deleteDriveFile: mocks.deleteDriveFileMock,
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
    mocks.getProveedorDocumentosMock.mockResolvedValue([])
    mocks.deleteProveedorDocumentoMock.mockResolvedValue(undefined)
    mocks.extractDriveFileIdMock.mockReturnValue(null)
    mocks.deleteDriveFileMock.mockResolvedValue(undefined)
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

  // Bug real (2026-09-20): antes esto NO actualizaba (protegía cualquier
  // regimen_fiscal ya asignado, incluido uno puesto por una constancia
  // vieja). El proveedor subía una segunda constancia con régimen
  // distinto y ni Mis datos ni Cuentas y facturas reflejaban el cambio.
  // Decisión explícita del usuario: la constancia manda, siempre pisa.
  it('constancia nueva con régimen distinto al ya asignado -- SÍ lo actualiza (la constancia más reciente manda)', async () => {
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'activo', regimen_fiscal: 'moral' })
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: null, regimen_fiscal: 'fisica' })

    await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

    expect(mocks.updateProveedorMock).toHaveBeenCalledWith('prov-1', { regimen_fiscal: 'fisica' })
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

  // Punto 2 (2026-09-20): auto-clasificación híbrida -- la misma lectura de
  // IA que ya corre para matching/régimen también decide estado_validacion.
  // Staff puede corregir después vía PATCH (ver
  // app/api/__tests__/proveedores-documentos-id-route.test.ts).
  describe('auto-clasificación de estado_validacion', () => {
    it('INE legible (nombre extraído) -- se crea como validado', async () => {
      mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: 'Jose Gutierrez', regimen_fiscal: null })

      await POST(buildRequest('INE'))

      expect(mocks.createProveedorDocumentoMock).toHaveBeenCalledWith(
        expect.objectContaining({ estado_validacion: 'validado', detalle_validacion: null })
      )
    })

    it('INE ilegible (IA no extrajo nombre) -- se crea en revision con motivo', async () => {
      mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: null, regimen_fiscal: null })

      await POST(buildRequest('INE'))

      expect(mocks.createProveedorDocumentoMock).toHaveBeenCalledWith(
        expect.objectContaining({ estado_validacion: 'revision', detalle_validacion: expect.stringContaining('nombre completo') })
      )
    })

    it('constancia legible (régimen extraído) -- se crea como validado', async () => {
      mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: null, regimen_fiscal: 'moral' })

      await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

      expect(mocks.createProveedorDocumentoMock).toHaveBeenCalledWith(
        expect.objectContaining({ estado_validacion: 'validado', detalle_validacion: null })
      )
    })

    it('constancia ilegible (IA no extrajo régimen) -- se crea en revision con motivo', async () => {
      mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: null, regimen_fiscal: null })

      await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

      expect(mocks.createProveedorDocumentoMock).toHaveBeenCalledWith(
        expect.objectContaining({ estado_validacion: 'revision', detalle_validacion: expect.stringContaining('régimen fiscal') })
      )
    })

    it('comprobante de domicilio/bancario no pasan por IA -- se crean pendiente (nadie los clasifica todavía)', async () => {
      await POST(buildRequest('COMPROBANTE_DOMICILIO'))

      expect(mocks.createProveedorDocumentoMock).toHaveBeenCalledWith(
        expect.objectContaining({ estado_validacion: 'pendiente', detalle_validacion: null })
      )
    })

    it('INE subido sin proveedor activo (sin extracción) -- se crea pendiente, no revision', async () => {
      mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', portal_estado: 'pendiente_confirmacion' })

      await POST(buildRequest('INE'))

      expect(mocks.extraerDatosIdentidadMock).not.toHaveBeenCalled()
      expect(mocks.createProveedorDocumentoMock).toHaveBeenCalledWith(
        expect.objectContaining({ estado_validacion: 'pendiente' })
      )
    })
  })

  // Bug real (2026-09-20): la Constancia de Situación Fiscal es de "verdad
  // única" -- el proveedor solo debe tener una en todo momento, la más
  // reciente. Antes se acumulaban todas las que subía sin límite y sin
  // borrar nada de Drive.
  describe('constancia como verdad única (reemplaza la anterior)', () => {
    it('sube una constancia nueva habiendo una vieja -- borra la vieja (documento + Drive)', async () => {
      mocks.getProveedorDocumentosMock.mockResolvedValue([
        { id: 'doc-nueva', proveedor_id: 'prov-1', tipo: 'CONSTANCIA_SITUACION_FISCAL', archivo_url: 'https://drive.google.com/file/d/nueva/view' },
        { id: 'doc-vieja', proveedor_id: 'prov-1', tipo: 'CONSTANCIA_SITUACION_FISCAL', archivo_url: 'https://drive.google.com/file/d/vieja/view' },
      ])
      mocks.createProveedorDocumentoMock.mockResolvedValue({ id: 'doc-nueva' })
      mocks.extractDriveFileIdMock.mockImplementation((url: string) => url.match(/\/file\/d\/([^/]+)/)?.[1] ?? null)

      await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

      expect(mocks.deleteDriveFileMock).toHaveBeenCalledWith('vieja')
      expect(mocks.deleteDriveFileMock).not.toHaveBeenCalledWith('nueva')
      expect(mocks.deleteProveedorDocumentoMock).toHaveBeenCalledWith('doc-vieja')
      expect(mocks.deleteProveedorDocumentoMock).not.toHaveBeenCalledWith('doc-nueva')
    })

    it('primera constancia que sube el proveedor -- no intenta borrar nada', async () => {
      mocks.getProveedorDocumentosMock.mockResolvedValue([{ id: 'doc-1', proveedor_id: 'prov-1', tipo: 'CONSTANCIA_SITUACION_FISCAL', archivo_url: 'https://drive.google.com/file/d/doc-1/view' }])

      await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

      expect(mocks.deleteDriveFileMock).not.toHaveBeenCalled()
      expect(mocks.deleteProveedorDocumentoMock).not.toHaveBeenCalled()
    })

    it('si Drive falla al borrar la constancia vieja, igual borra su registro en la base (best-effort)', async () => {
      mocks.getProveedorDocumentosMock.mockResolvedValue([
        { id: 'doc-nueva', proveedor_id: 'prov-1', tipo: 'CONSTANCIA_SITUACION_FISCAL', archivo_url: 'https://drive.google.com/file/d/nueva/view' },
        { id: 'doc-vieja', proveedor_id: 'prov-1', tipo: 'CONSTANCIA_SITUACION_FISCAL', archivo_url: 'https://drive.google.com/file/d/vieja/view' },
      ])
      mocks.createProveedorDocumentoMock.mockResolvedValue({ id: 'doc-nueva' })
      mocks.extractDriveFileIdMock.mockReturnValue('vieja')
      mocks.deleteDriveFileMock.mockRejectedValue(new Error('Drive caído'))

      await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

      expect(mocks.deleteProveedorDocumentoMock).toHaveBeenCalledWith('doc-vieja')
    })

    it('borrar la constancia vieja nunca toca documentos de otro tipo (INE, comprobantes)', async () => {
      mocks.getProveedorDocumentosMock.mockResolvedValue([
        { id: 'doc-nueva', proveedor_id: 'prov-1', tipo: 'CONSTANCIA_SITUACION_FISCAL', archivo_url: 'https://drive.google.com/file/d/nueva/view' },
        { id: 'doc-ine', proveedor_id: 'prov-1', tipo: 'INE', archivo_url: 'https://drive.google.com/file/d/ine/view' },
      ])
      mocks.createProveedorDocumentoMock.mockResolvedValue({ id: 'doc-nueva' })

      await POST(buildRequest('CONSTANCIA_SITUACION_FISCAL'))

      expect(mocks.deleteProveedorDocumentoMock).not.toHaveBeenCalledWith('doc-ine')
    })

    it('subir un INE no dispara ningún borrado de documentos (solo aplica a la constancia)', async () => {
      mocks.getProveedorDocumentosMock.mockResolvedValue([{ id: 'doc-ine-vieja', proveedor_id: 'prov-1', tipo: 'INE', archivo_url: 'https://drive.google.com/file/d/x/view' }])

      await POST(buildRequest('INE'))

      expect(mocks.deleteProveedorDocumentoMock).not.toHaveBeenCalled()
    })
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
