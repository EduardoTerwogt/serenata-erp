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

  it('EF-3 3D-12: FILE_TOO_LARGE -- "El archivo excede el límite de 10 MB"', async () => {
    const response = await POST(buildRequest({ xml: new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'f.xml', { type: 'text/xml' }) }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'El archivo excede el límite de 10 MB' })
  })
})
