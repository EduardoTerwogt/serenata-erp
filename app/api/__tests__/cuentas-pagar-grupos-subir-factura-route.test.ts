import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentaPagarGrupoByIdMock: vi.fn(),
  createDocumentoCuentaPagarMock: vi.fn(),
  getProyectoByIdMock: vi.fn(),
  getProveedorByIdMock: vi.fn(),
  marcarGrupoFacturadoMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
  parseFacturaXMLMock: vi.fn(),
  validarFacturaFiscalProveedorMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentaPagarGrupoById: mocks.getCuentaPagarGrupoByIdMock,
  createDocumentoCuentaPagar: mocks.createDocumentoCuentaPagarMock,
  getProyectoById: mocks.getProyectoByIdMock,
  getProveedorById: mocks.getProveedorByIdMock,
  marcarGrupoFacturado: mocks.marcarGrupoFacturadoMock,
}))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))
vi.mock('@/lib/server/xml/factura-parser', () => ({ parseFacturaXML: mocks.parseFacturaXMLMock }))
vi.mock('@/lib/server/validation/factura-fiscal', () => ({ validarFacturaFiscalProveedor: mocks.validarFacturaFiscalProveedorMock }))

import { POST } from '../cuentas-pagar/grupos/[id]/subir-factura/route'

const params = Promise.resolve({ id: 'grupo-1' })
const grupoAbierto = { id: 'grupo-1', proyecto_id: 'SH001', responsable_id: 'prov-1', responsable_nombre: 'Proveedor A', estado: 'ABIERTO', monto_total: 500, monto_pagado: 0 }

function buildRequest() {
  const formData = new FormData()
  formData.set('factura_proveedor_xml', new File(['<xml/>'], 'f.xml', { type: 'text/xml' }))
  formData.set('factura_proveedor_pdf', new File(['%PDF'], 'f.pdf', { type: 'application/pdf' }))
  return new Request('http://x/api/cuentas-pagar/grupos/grupo-1/subir-factura', { method: 'POST', body: formData })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue(grupoAbierto)
  mocks.getProyectoByIdMock.mockResolvedValue({ id: 'SH001', proyecto: 'Spot' })
  mocks.getProveedorByIdMock.mockResolvedValue({ regimen_fiscal: null })
  mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder' })
  mocks.uploadFileToDriveMock.mockResolvedValue('https://drive/factura.xml')
  mocks.createDocumentoCuentaPagarMock.mockResolvedValue({ id: 'doc-1' })
  mocks.parseFacturaXMLMock.mockReturnValue({ subtotal: 500 })
  mocks.validarFacturaFiscalProveedorMock.mockReturnValue({ estado_validacion: 'validado', detalle_validacion: null })
  mocks.marcarGrupoFacturadoMock.mockResolvedValue({ ...grupoAbierto, estado: 'FACTURADO' })
})

describe('POST /api/cuentas-pagar/grupos/[id]/subir-factura', () => {
  it('grupo no ABIERTO -- 409, no sube archivos', async () => {
    mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue({ ...grupoAbierto, estado: 'FACTURADO' })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('grupo_no_abierto')
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
  })

  it('factura válida -- crea documentos con grupo_id, cierra el grupo (FACTURADO)', async () => {
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(200)
    expect(mocks.createDocumentoCuentaPagarMock).toHaveBeenCalledWith(expect.objectContaining({ grupo_id: 'grupo-1', tipo: 'FACTURA_PROVEEDOR_XML' }))
    expect(mocks.createDocumentoCuentaPagarMock).toHaveBeenCalledWith(expect.objectContaining({ grupo_id: 'grupo-1', tipo: 'FACTURA_PROVEEDOR' }))
    expect(mocks.marcarGrupoFacturadoMock).toHaveBeenCalledWith('grupo-1')
    const body = await res.json()
    expect(body.grupo.estado).toBe('FACTURADO')
  })

  it('validación fiscal contra grupo.monto_total, no un x_pagar individual', async () => {
    await POST(buildRequest(), { params })
    expect(mocks.validarFacturaFiscalProveedorMock).toHaveBeenCalledWith(
      expect.anything(),
      grupoAbierto.monto_total,
      null
    )
  })

  it('factura con discrepancia (revision) -- guarda el documento pero NO cierra el grupo', async () => {
    mocks.validarFacturaFiscalProveedorMock.mockReturnValue({ estado_validacion: 'revision', detalle_validacion: 'no cuadra' })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(200)
    expect(mocks.marcarGrupoFacturadoMock).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.grupo.estado).toBe('ABIERTO')
  })

  it('grupo no encontrado -- 404', async () => {
    mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue(null)
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(404)
  })
})
