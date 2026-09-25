import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentaPagarGrupoByIdMock: vi.fn(),
  getDocumentosCuentaPagarGrupoMock: vi.fn(),
  planearFacturaMock: vi.fn(),
  completarReemplazoMock: vi.fn(),
  createDocumentoCuentaPagarMock: vi.fn(),
  getProyectoByIdMock: vi.fn(),
  getProveedorByIdMock: vi.fn(),
  validarFacturaProveedorMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
  parseFacturaXMLMock: vi.fn(),
  validarFacturaFiscalProveedorMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentaPagarGrupoById: mocks.getCuentaPagarGrupoByIdMock,
  getDocumentosCuentaPagarGrupo: mocks.getDocumentosCuentaPagarGrupoMock,
  createDocumentoCuentaPagar: mocks.createDocumentoCuentaPagarMock,
  getProyectoById: mocks.getProyectoByIdMock,
  getProveedorById: mocks.getProveedorByIdMock,
  validarFacturaProveedor: mocks.validarFacturaProveedorMock,
}))
vi.mock('@/lib/server/cuentas/reemplazo-factura', () => ({ planearFactura: mocks.planearFacturaMock, completarReemplazo: mocks.completarReemplazoMock }))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))
vi.mock('@/lib/server/xml/factura-parser', () => ({ parseFacturaXML: mocks.parseFacturaXMLMock }))
vi.mock('@/lib/server/validation/factura-fiscal', () => ({ validarFacturaFiscalProveedor: mocks.validarFacturaFiscalProveedorMock }))

import { POST } from '../cuentas-pagar/grupos/[id]/subir-factura/route'

const params = Promise.resolve({ id: 'grupo-1' })
const grupoAbierto = { id: 'grupo-1', proyecto_id: 'SH001', responsable_id: 'prov-1', responsable_nombre: 'Proveedor A', estado: 'ABIERTO', monto_total: 500, monto_pagado: 0, orden_pago_id: null }

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
  mocks.getDocumentosCuentaPagarGrupoMock.mockResolvedValue([])
  mocks.planearFacturaMock.mockResolvedValue({ ok: true, reemplazo: null })
  mocks.getProyectoByIdMock.mockResolvedValue({ id: 'SH001', proyecto: 'Spot' })
  mocks.getProveedorByIdMock.mockResolvedValue({ regimen_fiscal: null })
  mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder' })
  mocks.uploadFileToDriveMock.mockResolvedValue('https://drive/factura.xml')
  mocks.createDocumentoCuentaPagarMock.mockResolvedValue({ id: 'doc-1' })
  mocks.parseFacturaXMLMock.mockReturnValue({ subtotal: 500 })
  mocks.validarFacturaFiscalProveedorMock.mockReturnValue({ estado_validacion: 'validado', detalle_validacion: null })
  mocks.validarFacturaProveedorMock.mockResolvedValue({ documento_id: 'doc-1', estado: 'FACTURADO', total_a_transferir: 580 })
})

describe('POST /api/cuentas-pagar/grupos/[id]/subir-factura', () => {
  it('B7: el plan rechaza (factura validada sin reapertura, en orden, no admin) -- responde su código y no sube archivos', async () => {
    const vigentes = [{ id: 'doc-0', tipo: 'FACTURA_PROVEEDOR_XML', estado_validacion: 'validado' }]
    mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue({ ...grupoAbierto, estado: 'FACTURADO' })
    mocks.getDocumentosCuentaPagarGrupoMock.mockResolvedValue(vigentes)
    mocks.planearFacturaMock.mockResolvedValue({ ok: false, status: 409, body: { error: 'factura_vigente', message: 'reabre' } })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('factura_vigente')
    expect(mocks.planearFacturaMock).toHaveBeenCalledWith('proveedor', expect.objectContaining({ id: 'grupo-1' }), vigentes, undefined, null)
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
  })

  it('B7: grupo pagado cuya factura se dio de baja -- acepta la nueva y la RPC la valida sin cambiar el estado', async () => {
    mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue({ ...grupoAbierto, estado: 'PAGADO' })
    mocks.validarFacturaProveedorMock.mockResolvedValue({ documento_id: 'doc-1', estado: 'PAGADO', total_a_transferir: 580 })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(200)
    expect(mocks.validarFacturaProveedorMock).toHaveBeenCalledWith('doc-1', null)
    expect((await res.json()).grupo.estado).toBe('PAGADO')
    expect(mocks.completarReemplazoMock).not.toHaveBeenCalled()
  })

  it('B7: reemplazo -- la anterior se da de baja después de validar la nueva, apuntando a ella', async () => {
    const reemplazo = { dominio: 'proveedor', anteriores: ['doc-0'], motivo: 'RFC equivocado', usuario: 'admin@serenata.mx' }
    mocks.planearFacturaMock.mockResolvedValue({ ok: true, reemplazo })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(200)
    expect(mocks.completarReemplazoMock).toHaveBeenCalledWith(reemplazo, 'doc-1')
    expect(mocks.validarFacturaProveedorMock.mock.invocationCallOrder[0]).toBeLessThan(mocks.completarReemplazoMock.mock.invocationCallOrder[0])
  })

  it('B2 (V3): factura válida -- el XML entra como pendiente y SOLO la RPC lo valida y factura el grupo', async () => {
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(200)
    expect(mocks.createDocumentoCuentaPagarMock).toHaveBeenCalledWith(expect.objectContaining({ grupo_id: 'grupo-1', tipo: 'FACTURA_PROVEEDOR_XML', estado_validacion: 'pendiente' }))
    expect(mocks.createDocumentoCuentaPagarMock).toHaveBeenCalledWith(expect.objectContaining({ grupo_id: 'grupo-1', tipo: 'FACTURA_PROVEEDOR' }))
    expect(mocks.validarFacturaProveedorMock).toHaveBeenCalledWith('doc-1', null)
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
    expect(mocks.validarFacturaProveedorMock).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.grupo.estado).toBe('ABIERTO')
  })

  it('grupo no encontrado -- 404', async () => {
    mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue(null)
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(404)
  })
})
