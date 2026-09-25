import { describe, expect, it, vi } from 'vitest'

/**
 * EF-2 1E-2: mismo hallazgo y mismo fix que
 * cuentas-pagar-subir-factura-route.test.ts -- esta ruta exponía el
 * mensaje técnico crudo del error real directo al cliente.
 */

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentaCobrarByIdMock: vi.fn(),
  updateCuentaCobrarMock: vi.fn(),
  createDocumentoCuentaCobrarMock: vi.fn(),
  getCotizacionByIdMock: vi.fn(),
  getProyectoByIdMock: vi.fn(),
  parseFacturaXMLMock: vi.fn(),
  validarMontoFacturaMock: vi.fn(),
  validarFacturaClienteXMLMock: vi.fn(),
  calcularDeadlineMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentaCobrarById: mocks.getCuentaCobrarByIdMock,
  updateCuentaCobrar: mocks.updateCuentaCobrarMock,
  createDocumentoCuentaCobrar: mocks.createDocumentoCuentaCobrarMock,
  getCotizacionById: mocks.getCotizacionByIdMock,
  getProyectoById: mocks.getProyectoByIdMock,
}))
vi.mock('@/lib/server/xml/factura-parser', () => ({
  parseFacturaXML: mocks.parseFacturaXMLMock,
  validarMontoFactura: mocks.validarMontoFacturaMock,
  validarFacturaClienteXML: mocks.validarFacturaClienteXMLMock,
  calcularDeadline: mocks.calcularDeadlineMock,
}))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))

import { POST } from '../cuentas-cobrar/[id]/subir-factura/route'

const params = Promise.resolve({ id: 'cuenta-1' })

function buildRequest(overrides: Partial<{ xml: File | null; pdf: File | null }> = {}) {
  const formData = new FormData()
  const xml = overrides.xml === undefined ? new File(['<factura/>'], 'f.xml', { type: 'text/xml' }) : overrides.xml
  if (xml) formData.append('factura_xml', xml)
  if (overrides.pdf) formData.append('factura_pdf', overrides.pdf)
  return new Request('http://localhost/api/cuentas-cobrar/cuenta-1/subir-factura', { method: 'POST', body: formData })
}

describe('POST /api/cuentas-cobrar/[id]/subir-factura', () => {
  it('un error no anticipado nunca expone su mensaje técnico -- responde safeMessage genérico + requestId', async () => {
    const detalleTecnico = 'PGRST301: JWT expirado contra serenata-erp-test'
    mocks.getCuentaCobrarByIdMock.mockRejectedValueOnce(new Error(detalleTecnico))

    const response = await POST(buildRequest(), { params })
    expect(response.status).toBe(500)

    const body = await response.json() as { error: string; requestId: string }
    expect(body.error).toBe('Error interno, intenta de nuevo')
    expect(body.error).not.toContain('PGRST301')
    expect(body.error).not.toContain(detalleTecnico)
    expect(typeof body.requestId).toBe('string')
    expect(body.requestId.length).toBeGreaterThan(0)
  })

  it('EF-3 3D-12: XML_REQUIRED -- "Se requiere archivo XML de factura"', async () => {
    const response = await POST(buildRequest({ xml: null }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Se requiere archivo XML de factura' })
  })

  it('EF-3 3D-12: sin PDF nunca emite PDF_REQUIRED -- el PDF es opcional en CxC', async () => {
    mocks.getCuentaCobrarByIdMock.mockRejectedValueOnce(new Error('sondeo: no debe llegar aquí si PDF_REQUIRED se emitiera'))
    const response = await POST(buildRequest({ pdf: null }), { params })
    // Sin PDF pasa la validación de archivos y sigue de largo -- termina en
    // el mismo 500 genérico que cualquier otro fallo aguas abajo, nunca en
    // un 400 de "PDF requerido".
    expect(response.status).toBe(500)
  })

  it('EF-3 3D-12: XML_INVALID_TYPE -- "El archivo XML debe ser de tipo text/xml o application/xml"', async () => {
    const response = await POST(buildRequest({ xml: new File(['x'], 'f.bin', { type: 'application/octet-stream' }) }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'El archivo XML debe ser de tipo text/xml o application/xml' })
  })

  it('EF-3 3D-12: PDF_INVALID_TYPE (solo si se mandó un PDF) -- "El archivo PDF debe ser de tipo application/pdf"', async () => {
    const response = await POST(buildRequest({ pdf: new File(['x'], 'f.bin', { type: 'application/octet-stream' }) }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'El archivo PDF debe ser de tipo application/pdf' })
  })

  it('EF-3 3D-12: FILE_TOO_LARGE -- "El archivo excede el límite de 4 MB" (supuesto 15)', async () => {
    const response = await POST(buildRequest({ xml: new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'f.xml', { type: 'text/xml' }) }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'El archivo excede el límite de 4 MB' })
  })

  describe('B1: estado calculado (V2) y datos del CFDI en el documento (U7)', () => {
    function exito(montoPagado: number) {
      mocks.getCuentaCobrarByIdMock.mockResolvedValueOnce({ id: 'cuenta-1', cotizacion_id: 'SH001', monto_total: 1000, monto_pagado: montoPagado })
      mocks.getCotizacionByIdMock.mockResolvedValueOnce({ id: 'SH001', tipo: 'PRINCIPAL', total: 1000 })
      mocks.getProyectoByIdMock.mockResolvedValueOnce({ id: 'SH001', proyecto: 'Evento' })
      mocks.parseFacturaXMLMock.mockReturnValueOnce({ fecha_emision: '2026-09-20', monto_total: 1000, uuid_timbrado: 'UUID-1', metodo_pago: 'PPD' })
      mocks.validarMontoFacturaMock.mockReturnValueOnce({ coincide: true, diferencia: 0 })
      mocks.validarFacturaClienteXMLMock.mockReturnValueOnce({ estado_validacion: 'validado', detalle_validacion: null })
      mocks.calcularDeadlineMock.mockReturnValueOnce('2099-10-20')
      mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder' })
      mocks.uploadFileToDriveMock.mockResolvedValue('https://drive/x')
      mocks.updateCuentaCobrarMock.mockImplementationOnce(async (_id: string, u: unknown) => u)
      mocks.createDocumentoCuentaCobrarMock.mockClear()
      mocks.updateCuentaCobrarMock.mockClear()
    }

    it.each([
      [0, 'FACTURADO'],
      [400, 'PARCIALMENTE_PAGADO'],
      [1000, 'PAGADO'],
    ])('con %s ya pagado (anticipo) el estado guardado es %s, nunca FACTURADO fijo', async (pagado, esperado) => {
      exito(pagado)
      const response = await POST(buildRequest(), { params })
      expect(response.status).toBe(200)
      expect(mocks.updateCuentaCobrarMock.mock.calls[0][1]).toMatchObject({ estado: esperado })
    })

    it('guarda UUID, total y método del CFDI en la fila del XML', async () => {
      exito(0)
      await POST(buildRequest(), { params })
      const xmlDoc = mocks.createDocumentoCuentaCobrarMock.mock.calls.map((c) => c[0]).find((d) => d.tipo === 'FACTURA_XML')
      expect(xmlDoc).toMatchObject({ uuid_cfdi: 'UUID-1', total_cfdi: 1000, metodo_pago_cfdi: 'PPD' })
    })
  })
})

