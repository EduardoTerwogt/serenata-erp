import { describe, expect, it, vi } from 'vitest'

/**
 * EF-2 1E-2: esta ruta exponía el mensaje técnico crudo del error real
 * (`error.message`/`String(error)`) directo al cliente en su catch. Ahora
 * usa `buildErrorResponse` -- este test confirma el contrato nuevo: nunca
 * el detalle técnico en la respuesta, sí un `requestId` correlacionable.
 */

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentaPagarByIdMock: vi.fn(),
  createDocumentoCuentaPagarMock: vi.fn(),
  getProyectoByIdMock: vi.fn(),
  updateCuentaPagarMock: vi.fn(),
  getProveedorByIdMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
  parseFacturaXMLMock: vi.fn(),
  validarFacturaFiscalProveedorMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentaPagarById: mocks.getCuentaPagarByIdMock,
  createDocumentoCuentaPagar: mocks.createDocumentoCuentaPagarMock,
  getProyectoById: mocks.getProyectoByIdMock,
  updateCuentaPagar: mocks.updateCuentaPagarMock,
  getProveedorById: mocks.getProveedorByIdMock,
}))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))
vi.mock('@/lib/server/xml/factura-parser', () => ({ parseFacturaXML: mocks.parseFacturaXMLMock }))
vi.mock('@/lib/server/validation/factura-fiscal', () => ({ validarFacturaFiscalProveedor: mocks.validarFacturaFiscalProveedorMock }))

import { POST } from '../cuentas-pagar/[id]/subir-factura/route'

const params = Promise.resolve({ id: 'cuenta-1' })

function buildRequest(overrides: Partial<{ xml: File | null; pdf: File | null }> = {}) {
  const formData = new FormData()
  const xml = overrides.xml === undefined ? new File(['<factura/>'], 'f.xml', { type: 'text/xml' }) : overrides.xml
  const pdf = overrides.pdf === undefined ? new File([new Uint8Array([1, 2, 3])], 'f.pdf', { type: 'application/pdf' }) : overrides.pdf
  if (xml) formData.append('factura_proveedor_xml', xml)
  if (pdf) formData.append('factura_proveedor_pdf', pdf)
  return new Request('http://localhost/api/cuentas-pagar/cuenta-1/subir-factura', { method: 'POST', body: formData })
}

describe('POST /api/cuentas-pagar/[id]/subir-factura', () => {
  it('un error no anticipado nunca expone su mensaje técnico -- responde safeMessage genérico + requestId', async () => {
    const detalleTecnico = 'ECONNRESET: la conexión a Postgres se cayó a mitad de la query'
    mocks.getCuentaPagarByIdMock.mockRejectedValueOnce(new Error(detalleTecnico))

    const response = await POST(buildRequest(), { params })
    expect(response.status).toBe(500)

    const body = await response.json() as { error: string; requestId: string }
    expect(body.error).toBe('Error interno, intenta de nuevo')
    expect(body.error).not.toContain('ECONNRESET')
    expect(body.error).not.toContain(detalleTecnico)
    expect(typeof body.requestId).toBe('string')
    expect(body.requestId.length).toBeGreaterThan(0)
  })

  it('cada error no anticipado trae un requestId distinto', async () => {
    mocks.getCuentaPagarByIdMock.mockRejectedValueOnce(new Error('primer fallo'))
    const first = await POST(buildRequest(), { params }).then((r) => r.json()) as { requestId: string }

    mocks.getCuentaPagarByIdMock.mockRejectedValueOnce(new Error('segundo fallo'))
    const second = await POST(buildRequest(), { params }).then((r) => r.json()) as { requestId: string }

    expect(first.requestId).not.toBe(second.requestId)
  })

  it('EF-3 3D-12: XML_REQUIRED -- "Se requiere archivo XML de factura proveedor"', async () => {
    const response = await POST(buildRequest({ xml: null }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Se requiere archivo XML de factura proveedor' })
  })

  it('EF-3 3D-12: PDF_REQUIRED -- "Se requiere archivo PDF de factura proveedor"', async () => {
    const response = await POST(buildRequest({ pdf: null }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Se requiere archivo PDF de factura proveedor' })
  })

  it('EF-3 3D-12: XML_INVALID_TYPE -- "El archivo XML debe ser de tipo text/xml o application/xml"', async () => {
    const response = await POST(buildRequest({ xml: new File(['x'], 'f.bin', { type: 'application/octet-stream' }) }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'El archivo XML debe ser de tipo text/xml o application/xml' })
  })

  it('EF-3 3D-12: PDF_INVALID_TYPE -- "El archivo PDF debe ser de tipo application/pdf"', async () => {
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
