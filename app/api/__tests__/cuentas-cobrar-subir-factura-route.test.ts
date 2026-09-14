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

function buildRequest() {
  const formData = new FormData()
  formData.append('factura_xml', new File(['<factura/>'], 'f.xml', { type: 'text/xml' }))
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
})
