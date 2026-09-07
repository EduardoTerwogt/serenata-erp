import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hashPasswordMock: vi.fn(),
  crearProveedorDesdeSignupMock: vi.fn(),
  buscarCandidatosMatchMock: vi.fn(),
  createProveedorDocumentoMock: vi.fn(),
  getProveedorByCorreoMock: vi.fn(),
  updateProveedorMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
  extraerDatosIdentidadMock: vi.fn(),
  setPortalSessionCookieMock: vi.fn(),
}))

vi.mock('@/lib/auth-utils', () => ({
  hashPassword: mocks.hashPasswordMock,
}))

vi.mock('@/lib/db', () => ({
  crearProveedorDesdeSignup: mocks.crearProveedorDesdeSignupMock,
  buscarCandidatosMatch: mocks.buscarCandidatosMatchMock,
  createProveedorDocumento: mocks.createProveedorDocumentoMock,
  getProveedorByCorreo: mocks.getProveedorByCorreoMock,
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

vi.mock('@/lib/portal-auth', () => ({
  setPortalSessionCookie: mocks.setPortalSessionCookieMock,
}))

import { POST } from '../portal/signup/route'

function buildFormData(overrides: Partial<{ nombre: string; correo: string; password: string; ine: File | null; constancia: File | null }> = {}) {
  const formData = new FormData()
  formData.set('nombre', overrides.nombre ?? 'Jose Gutierrez')
  formData.set('correo', overrides.correo ?? 'jose@correo.com')
  formData.set('password', overrides.password ?? 'password123')
  const ine = overrides.ine === undefined ? new File(['contenido'], 'ine.jpg', { type: 'image/jpeg' }) : overrides.ine
  const constancia = overrides.constancia === undefined ? new File(['contenido'], 'constancia.pdf', { type: 'application/pdf' }) : overrides.constancia
  if (ine) formData.set('ine', ine)
  if (constancia) formData.set('constancia', constancia)
  return formData
}

describe('POST /api/portal/signup', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.getProveedorByCorreoMock.mockResolvedValue(null)
    mocks.getGoogleEnvMock.mockReturnValue({ driveFolderId: 'root-folder' })
    mocks.extraerDatosIdentidadMock.mockResolvedValue({ nombre_completo: null, regimen_fiscal: null })
    mocks.hashPasswordMock.mockResolvedValue('hash123')
    mocks.uploadFileToDriveMock.mockResolvedValue('https://drive.google.com/file')
    mocks.createProveedorDocumentoMock.mockResolvedValue({})
    mocks.crearProveedorDesdeSignupMock.mockResolvedValue({ id: 'prov-1', nombre: 'Jose Gutierrez' })
    mocks.buscarCandidatosMatchMock.mockResolvedValue([])
    mocks.updateProveedorMock.mockResolvedValue({})
  })

  it('retorna 400 si falta el INE', async () => {
    const response = await POST(new Request('http://localhost/api/portal/signup', { method: 'POST', body: buildFormData({ ine: null }) }))
    expect(response.status).toBe(400)
    expect(mocks.crearProveedorDesdeSignupMock).not.toHaveBeenCalled()
  })

  it('retorna 400 si el archivo no es un tipo soportado', async () => {
    const archivoInvalido = new File(['contenido'], 'ine.txt', { type: 'text/plain' })
    const response = await POST(new Request('http://localhost/api/portal/signup', { method: 'POST', body: buildFormData({ ine: archivoInvalido }) }))
    expect(response.status).toBe(400)
  })

  it('retorna 409 si ya existe una cuenta de portal con ese correo', async () => {
    mocks.getProveedorByCorreoMock.mockResolvedValue({ id: 'existente' })
    const response = await POST(new Request('http://localhost/api/portal/signup', { method: 'POST', body: buildFormData() }))
    expect(response.status).toBe(409)
  })

  it('crea el proveedor y activa la cuenta directo cuando no hay candidatos de match', async () => {
    const response = await POST(new Request('http://localhost/api/portal/signup', { method: 'POST', body: buildFormData() }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ success: true, requiere_confirmacion: false, candidatos: [] })
    expect(mocks.crearProveedorDesdeSignupMock).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Jose Gutierrez', correo: 'jose@correo.com', password_hash: 'hash123' })
    )
    expect(mocks.updateProveedorMock).not.toHaveBeenCalled()
    expect(mocks.setPortalSessionCookieMock).toHaveBeenCalledWith('prov-1')
  })

  it('marca pendiente_confirmacion y regresa los candidatos cuando el matching encuentra alguno', async () => {
    mocks.buscarCandidatosMatchMock.mockResolvedValue([{ id: 'cand-1', nombre: 'Antonio Gutierrez', score: 0.5 }])

    const response = await POST(new Request('http://localhost/api/portal/signup', { method: 'POST', body: buildFormData() }))

    const body = await response.json()
    expect(body.requiere_confirmacion).toBe(true)
    expect(body.candidatos).toEqual([{ id: 'cand-1', nombre: 'Antonio Gutierrez', score: 0.5 }])
    expect(mocks.updateProveedorMock).toHaveBeenCalledWith('prov-1', {
      portal_estado: 'pendiente_confirmacion',
      match_candidato_id: 'cand-1',
    })
  })

  it('usa el nombre extraído del documento (no el tecleado) para buscar candidatos si Claude lo lee', async () => {
    mocks.extraerDatosIdentidadMock
      .mockResolvedValueOnce({ nombre_completo: 'Jose Antonio Gutierrez Hernandez', regimen_fiscal: null })
      .mockResolvedValueOnce({ nombre_completo: null, regimen_fiscal: 'fisica' })

    await POST(new Request('http://localhost/api/portal/signup', { method: 'POST', body: buildFormData() }))

    expect(mocks.buscarCandidatosMatchMock).toHaveBeenCalledWith('Jose Antonio Gutierrez Hernandez', 'prov-1')
    expect(mocks.crearProveedorDesdeSignupMock).toHaveBeenCalledWith(
      expect.objectContaining({ regimen_fiscal: 'fisica' })
    )
  })
})
