import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePortalSessionMock: vi.fn(),
  getCuentaPagarGrupoByIdMock: vi.fn(),
  createDocumentoCuentaPagarMock: vi.fn(),
  getProyectoByIdMock: vi.fn(),
  getProveedorByIdMock: vi.fn(),
  marcarGrupoFacturadoMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
  parseFacturaXMLMock: vi.fn(),
  validarFacturaFiscalProveedorMock: vi.fn(),
  calcularEjemploFacturaMock: vi.fn(),
}))

vi.mock('@/lib/portal-auth', () => ({
  requirePortalSession: mocks.requirePortalSessionMock,
}))

vi.mock('@/lib/db', () => ({
  getCuentaPagarGrupoById: mocks.getCuentaPagarGrupoByIdMock,
  createDocumentoCuentaPagar: mocks.createDocumentoCuentaPagarMock,
  getProyectoById: mocks.getProyectoByIdMock,
  getProveedorById: mocks.getProveedorByIdMock,
  marcarGrupoFacturado: mocks.marcarGrupoFacturadoMock,
}))

vi.mock('@/lib/integrations/google/drive', () => ({
  uploadFileToDrive: mocks.uploadFileToDriveMock,
}))

vi.mock('@/lib/integrations/google/env', () => ({
  getGoogleEnv: mocks.getGoogleEnvMock,
}))

vi.mock('@/lib/server/xml/factura-parser', () => ({
  parseFacturaXML: mocks.parseFacturaXMLMock,
}))

vi.mock('@/lib/server/validation/factura-fiscal', () => ({
  validarFacturaFiscalProveedor: mocks.validarFacturaFiscalProveedorMock,
  calcularEjemploFactura: mocks.calcularEjemploFacturaMock,
}))

import { POST } from '../portal/cuentas/grupos/[id]/factura/route'

function buildRequest(overrides: Partial<{ xml: File | null; pdf: File | null }> = {}) {
  const formData = new FormData()
  const xml = overrides.xml === undefined ? new File(['<xml></xml>'], 'factura.xml', { type: 'text/xml' }) : overrides.xml
  const pdf = overrides.pdf === undefined ? new File(['contenido'], 'factura.pdf', { type: 'application/pdf' }) : overrides.pdf
  if (xml) formData.set('factura_xml', xml)
  if (pdf) formData.set('factura_pdf', pdf)
  return new Request('http://localhost/api/portal/cuentas/grupos/grupo-1/factura', { method: 'POST', body: formData })
}

function params() {
  return { params: Promise.resolve({ id: 'grupo-1' }) }
}

describe('POST /api/portal/cuentas/grupos/[id]/factura', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: 'prov-1', response: null })
    mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue(
      { id: 'grupo-1', responsable_id: 'prov-1', estado: 'ABIERTO', monto_total: 1000, proyecto_id: 'SH001' },
    )
    mocks.getProveedorByIdMock.mockResolvedValue({ id: 'prov-1', regimen_fiscal: 'moral' })
    mocks.getProyectoByIdMock.mockResolvedValue({ id: 'SH001', proyecto: 'Spot Verano' })
    mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder-cuentas' })
    mocks.uploadFileToDriveMock.mockResolvedValue('https://drive.google.com/file')
    mocks.createDocumentoCuentaPagarMock.mockResolvedValue({})
    mocks.marcarGrupoFacturadoMock.mockResolvedValue({ id: 'grupo-1', estado: 'FACTURADO' })
    mocks.calcularEjemploFacturaMock.mockReturnValue({ subtotal: 1000, iva_trasladado: 160, iva_retenido: 0, isr_retenido: 0, total: 1160, explicacion: 'ejemplo' })
  })

  it('retorna 401 sin sesión de portal', async () => {
    mocks.requirePortalSessionMock.mockResolvedValue({ proveedorId: null, response: Response.json({ error: 'No autenticado' }, { status: 401 }) })
    const response = await POST(buildRequest(), params())
    expect(response.status).toBe(401)
  })

  it('retorna 400 si falta el PDF', async () => {
    const response = await POST(buildRequest({ pdf: null }), params())
    expect(response.status).toBe(400)
  })

  it('retorna 404 si el grupo no existe', async () => {
    mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue(null)
    const response = await POST(buildRequest(), params())
    expect(response.status).toBe(404)
  })

  it('retorna 403 si el grupo no pertenece al proveedor autenticado', async () => {
    mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue({ id: 'grupo-1', responsable_id: 'otro-proveedor', estado: 'ABIERTO', monto_total: 1000, proyecto_id: 'SH001' })
    const response = await POST(buildRequest(), params())
    expect(response.status).toBe(403)
  })

  it('retorna 409 si el grupo ya no está ABIERTO', async () => {
    mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue({ id: 'grupo-1', responsable_id: 'prov-1', estado: 'FACTURADO', monto_total: 1000, proyecto_id: 'SH001' })
    const response = await POST(buildRequest(), params())
    expect(response.status).toBe(409)
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
  })

  it('bloquea (422) con mensaje genérico y SIN ejemplo cuando el mismatch es de subtotal', async () => {
    mocks.parseFacturaXMLMock.mockReturnValue({ subtotal: 900, monto_total: 1044 })
    mocks.validarFacturaFiscalProveedorMock.mockReturnValue({
      estado_validacion: 'revision',
      detalle_validacion: 'Subtotal no coincide: XML $900.00 vs esperado $1000.00.',
      mismatches: [{ campo: 'subtotal', mensaje: 'Subtotal no coincide: XML $900.00 vs esperado $1000.00.' }],
    })

    const response = await POST(buildRequest(), params())

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error).not.toContain('900')
    expect(body.error).not.toContain('1000')
    expect(body.error).toMatch(/no corresponde a lo esperado/)
    expect(body.ejemplo).toBeUndefined()
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
    expect(mocks.createDocumentoCuentaPagarMock).not.toHaveBeenCalled()
    expect(mocks.marcarGrupoFacturadoMock).not.toHaveBeenCalled()
  })

  it('bloquea (422) con el mensaje específico y el ejemplo cuando el mismatch es de desglose (subtotal correcto)', async () => {
    mocks.parseFacturaXMLMock.mockReturnValue({ subtotal: 1000, iva_trasladado: 0, monto_total: 1000 })
    mocks.validarFacturaFiscalProveedorMock.mockReturnValue({
      estado_validacion: 'revision',
      detalle_validacion: 'IVA trasladado no coincide: XML $0.00 vs esperado $160.00 (16% del subtotal).',
      mismatches: [{ campo: 'iva_trasladado', mensaje: 'IVA trasladado no coincide: XML $0.00 vs esperado $160.00 (16% del subtotal).' }],
    })

    const response = await POST(buildRequest(), params())

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error).toContain('IVA trasladado no coincide')
    expect(body.ejemplo).toEqual({ subtotal: 1000, iva_trasladado: 160, iva_retenido: 0, isr_retenido: 0, total: 1160, explicacion: 'ejemplo' })
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
    expect(mocks.createDocumentoCuentaPagarMock).not.toHaveBeenCalled()
    expect(mocks.marcarGrupoFacturadoMock).not.toHaveBeenCalled()
  })

  it('bloquea (422) con ejemplo cuando el XML no se puede parsear', async () => {
    mocks.parseFacturaXMLMock.mockReturnValue({ error: 'XML malformado' })

    const response = await POST(buildRequest(), params())

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error).toContain('XML malformado')
    expect(body.ejemplo).toBeDefined()
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
  })

  it('sube ambos archivos, crea los documentos con grupo_id y marca el grupo FACTURADO cuando la factura es válida', async () => {
    mocks.parseFacturaXMLMock.mockReturnValue({ subtotal: 1000, iva_trasladado: 160, monto_total: 1160 })
    mocks.validarFacturaFiscalProveedorMock.mockReturnValue({ estado_validacion: 'validado', detalle_validacion: null })

    const response = await POST(buildRequest(), params())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(mocks.uploadFileToDriveMock).toHaveBeenCalledTimes(2)
    expect(mocks.createDocumentoCuentaPagarMock).toHaveBeenCalledTimes(2)
    expect(mocks.createDocumentoCuentaPagarMock).toHaveBeenCalledWith(
      expect.objectContaining({ grupo_id: 'grupo-1', tipo: 'FACTURA_PROVEEDOR_XML', estado_validacion: 'validado' })
    )
    expect(mocks.marcarGrupoFacturadoMock).toHaveBeenCalledWith('grupo-1')
  })

  it('EF-3 3D-10: un error inesperado (crudo de Supabase) nunca expone su mensaje real al cliente', async () => {
    mocks.getCuentaPagarGrupoByIdMock.mockRejectedValue(new Error('constraint violation on cuentas_pagar_grupos'))
    const response = await POST(buildRequest(), params())
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain('cuentas_pagar_grupos')
    expect(body.requestId).toEqual(expect.any(String))
  })

  it('EF-3 3D-12: XML_REQUIRED -- "Se requiere el archivo XML de tu factura"', async () => {
    const response = await POST(buildRequest({ xml: null }), params())
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Se requiere el archivo XML de tu factura' })
  })

  it('EF-3 3D-12: PDF_REQUIRED -- "Se requiere el archivo PDF de tu factura"', async () => {
    const response = await POST(buildRequest({ pdf: null }), params())
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Se requiere el archivo PDF de tu factura' })
  })

  it('EF-3 3D-12: XML_INVALID_TYPE -- "El archivo XML debe ser de tipo text/xml o application/xml"', async () => {
    const response = await POST(buildRequest({ xml: new File(['x'], 'f.bin', { type: 'application/octet-stream' }) }), params())
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'El archivo XML debe ser de tipo text/xml o application/xml' })
  })

  it('EF-3 3D-12: PDF_INVALID_TYPE -- "El archivo PDF debe ser de tipo application/pdf"', async () => {
    const response = await POST(buildRequest({ pdf: new File(['x'], 'f.bin', { type: 'application/octet-stream' }) }), params())
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'El archivo PDF debe ser de tipo application/pdf' })
  })

  it('EF-3 3D-12: FILE_TOO_LARGE -- "El archivo excede el límite de 10 MB"', async () => {
    const response = await POST(buildRequest({ xml: new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'factura.xml', { type: 'text/xml' }) }), params())
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'El archivo excede el límite de 10 MB' })
  })
})
