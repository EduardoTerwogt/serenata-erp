import { beforeEach, describe, expect, it, vi } from 'vitest'

// Rediseño de Cuentas B1 (docs/PLAN.md, S8, D16, D27, R11).
const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentaCobrarByIdMock: vi.fn(),
  getDocumentosCuentaCobrarMock: vi.fn(),
  getPagosComprobantesByCuentaMock: vi.fn(),
  createDocumentoCuentaCobrarMock: vi.fn(async (d: unknown) => d),
  uploadFileToDriveMock: vi.fn(async () => 'https://drive/x'),
  getGoogleEnvMock: vi.fn(() => ({ driveFolderIdCuentas: 'folder' })),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentaCobrarById: mocks.getCuentaCobrarByIdMock,
  getDocumentosCuentaCobrar: mocks.getDocumentosCuentaCobrarMock,
  getPagosComprobantesByCuenta: mocks.getPagosComprobantesByCuentaMock,
  createDocumentoCuentaCobrar: mocks.createDocumentoCuentaCobrarMock,
}))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))

import { POST } from '../cuentas-cobrar/[id]/subir-complemento/route'

const UUID_FACTURA = 'aaaaaaaa-1111-2222-3333-444444444444'
const PAGO_ID = '5eedc000-0000-4000-8000-000000000001'
const complementoXml = (impPagado: string) => `
  <cfdi:Comprobante TipoDeComprobante="P">
    <cfdi:Complemento>
      <pago20:Pagos Version="2.0">
        <pago20:Pago FechaPago="2026-09-10T12:00:00" MonedaP="MXN" Monto="${impPagado}">
          <pago20:DoctoRelacionado IdDocumento="${UUID_FACTURA}" ImpPagado="${impPagado}" />
        </pago20:Pago>
      </pago20:Pagos>
    </cfdi:Complemento>
  </cfdi:Comprobante>`

function request(files: { xml?: string; pdf?: boolean; pago_id?: string }) {
  const formData = new FormData()
  if (files.xml) formData.append('complemento_xml', new File([files.xml], 'cp.xml', { type: 'text/xml' }))
  if (files.pdf) formData.append('complemento_pdf', new File(['%PDF'], 'cp.pdf', { type: 'application/pdf' }))
  if (files.pago_id) formData.append('pago_id', files.pago_id)
  return new Request('http://x', { method: 'POST', body: formData })
}
const params = Promise.resolve({ id: 'cuenta-1' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCuentaCobrarByIdMock.mockResolvedValue({ id: 'cuenta-1', cotizacion_id: 'SH001', folio: 'CC-1' })
  mocks.getPagosComprobantesByCuentaMock.mockResolvedValue([
    { id: PAGO_ID, monto: 1000, fecha_pago: '2026-09-10', created_at: '2026-09-10T10:00:00' },
  ])
  mocks.getDocumentosCuentaCobrarMock.mockResolvedValue([
    { tipo: 'FACTURA_XML', fecha_carga: '2026-09-05 10:00:00', uuid_cfdi: UUID_FACTURA },
  ])
})

describe('POST /api/cuentas-cobrar/[id]/subir-complemento', () => {
  it('sin XML ni PDF → 400', async () => {
    const res = await POST(request({}), { params })
    expect(res.status).toBe(400)
  })

  it('S8: acepta solo el XML, lo vincula al pago y lo valida contra la factura (D16, R11)', async () => {
    const res = await POST(request({ xml: complementoXml('1000.00') }), { params })
    expect(res.status).toBe(200)
    expect(mocks.createDocumentoCuentaCobrarMock).toHaveBeenCalledTimes(1)
    expect(mocks.createDocumentoCuentaCobrarMock.mock.calls[0][0]).toMatchObject({
      tipo: 'COMPLEMENTO_PAGO', pago_id: PAGO_ID, estado_validacion: 'validado',
    })
  })

  it('ImpPagado distinto del pago → queda en revisión', async () => {
    await POST(request({ xml: complementoXml('999.00') }), { params })
    expect(mocks.createDocumentoCuentaCobrarMock.mock.calls[0][0]).toMatchObject({ estado_validacion: 'revision' })
  })

  it('acepta solo el PDF (se sube en otra petición, supuesto 15)', async () => {
    const res = await POST(request({ pdf: true }), { params })
    expect(res.status).toBe(200)
    expect(mocks.createDocumentoCuentaCobrarMock.mock.calls[0][0]).toMatchObject({ tipo: 'COMPLEMENTO_PAGO_PDF', pago_id: PAGO_ID })
  })

  it('pago_id que no es de la cuenta → 400, sin subir nada', async () => {
    const res = await POST(request({ xml: complementoXml('1000.00'), pago_id: '5eedc000-0000-4000-8000-000000000099' }), { params })
    expect(res.status).toBe(400)
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
  })
})
