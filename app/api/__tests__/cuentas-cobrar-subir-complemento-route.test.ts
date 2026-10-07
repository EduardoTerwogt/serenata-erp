import { beforeEach, describe, expect, it, vi } from 'vitest'

// #123 (B2, P9, T11): el complemento se liga por RPC (UUID de la factura + monto pagado); TS ya no elige el pago.
const mocks = vi.hoisted(() => {
  const filas: Record<string, Record<string, unknown> | null> = {}
  const cadena = (tabla: string) => {
    const c: Record<string, unknown> = {}
    for (const m of ['eq', 'is', 'limit']) c[m] = () => c
    c.maybeSingle = async () => ({ data: filas[tabla] ?? null, error: null })
    return c
  }
  return {
    filas,
    requireSectionMock: vi.fn(async () => ({ response: null, session: { user: { email: 'staff@serenata.test' } } })),
    getCuentaCobrarByIdMock: vi.fn(),
    rpcMock: vi.fn(),
    from: vi.fn((tabla: string) => ({ select: () => cadena(tabla), insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'doc-pdf' }, error: null }) }) }) })),
    uploadFileToDriveMock: vi.fn(async () => 'https://drive/x'),
    getGoogleEnvMock: vi.fn(() => ({ driveFolderIdCuentas: 'folder' })),
  }
})

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({ getCuentaCobrarById: mocks.getCuentaCobrarByIdMock }))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpcMock } }))

import { POST } from '../cuentas-cobrar/[id]/subir-complemento/route'

const UUID_FACTURA = 'aaaaaaaa-1111-2222-3333-444444444444'
const PAGO_ID = '5eedc000-0000-4000-8000-000000000001'
const complementoXml = (impPagado: string, uuid = UUID_FACTURA) => `
  <cfdi:Comprobante TipoDeComprobante="P">
    <cfdi:Complemento>
      <pago20:Pagos Version="2.0">
        <pago20:Pago FechaPago="2026-09-10T12:00:00" MonedaP="MXN" Monto="${impPagado}">
          <pago20:DoctoRelacionado IdDocumento="${uuid}" ImpPagado="${impPagado}" />
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
  for (const k of Object.keys(mocks.filas)) delete mocks.filas[k]
  mocks.getCuentaCobrarByIdMock.mockResolvedValue({ id: 'cuenta-1', cotizacion_id: 'SH001', folio: 'CC-1', factura_documento_id: 'fac-1' })
  mocks.filas.cuentas_cobrar = { factura_documento_id: 'fac-1' }
  mocks.filas.documentos_cuentas_cobrar = { id: 'xml-1', uuid_cfdi: UUID_FACTURA, monto_pagado: 1000 }
  mocks.rpcMock.mockResolvedValue({ data: { pago_id: PAGO_ID, documentos: [{ id: 'c-1' }] }, error: null })
})

describe('POST /api/cuentas-cobrar/[id]/subir-complemento', () => {
  it('sin XML ni PDF → 400', async () => {
    const res = await POST(request({}), { params })
    expect(res.status).toBe(400)
  })

  it('cuenta sin factura vigente → 409, sin subir nada', async () => {
    mocks.getCuentaCobrarByIdMock.mockResolvedValue({ id: 'cuenta-1', cotizacion_id: 'SH001', factura_documento_id: null })
    const res = await POST(request({ xml: complementoXml('1000.00') }), { params })
    expect(res.status).toBe(409)
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
  })

  it('XML: manda los relacionados (UUID + ImpPagado) a ligar_complemento_cobro', async () => {
    const res = await POST(request({ xml: complementoXml('1000.00') }), { params })
    expect(res.status).toBe(200)
    expect(mocks.rpcMock).toHaveBeenCalledWith('ligar_complemento_cobro', expect.objectContaining({
      p_relacionados: [expect.objectContaining({ uuid_factura: UUID_FACTURA, monto_pagado: 1000 })],
      p_pago_id: null,
      p_usuario: 'staff@serenata.test',
    }))
  })

  it('el complemento de otra factura → 400, sin subir nada', async () => {
    const res = await POST(request({ xml: complementoXml('1000.00', 'bbbbbbbb-1111-2222-3333-444444444444') }), { params })
    expect(res.status).toBe(400)
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('pago_id elegido a mano viaja a la RPC', async () => {
    await POST(request({ xml: complementoXml('1000.00'), pago_id: PAGO_ID }), { params })
    expect(mocks.rpcMock).toHaveBeenCalledWith('ligar_complemento_cobro', expect.objectContaining({ p_pago_id: PAGO_ID }))
  })

  it('errores esperados de la RPC se traducen (complemento_ambiguo → 409)', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { message: 'complemento_ambiguo: 2 pagos' } })
    const res = await POST(request({ xml: complementoXml('1000.00') }), { params })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('complemento_ambiguo')
  })

  it('solo el PDF sin pago_id → 400', async () => {
    const res = await POST(request({ pdf: true }), { params })
    expect(res.status).toBe(400)
  })

  it('solo el PDF con pago_id: se agrega al XML vigente de ese pago', async () => {
    const res = await POST(request({ pdf: true, pago_id: PAGO_ID }), { params })
    expect(res.status).toBe(200)
    expect(mocks.uploadFileToDriveMock).toHaveBeenCalledTimes(1)
  })

  it('solo el PDF y el pago no tiene XML → 409', async () => {
    mocks.filas.documentos_cuentas_cobrar = null
    const res = await POST(request({ pdf: true, pago_id: PAGO_ID }), { params })
    expect(res.status).toBe(409)
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
  })
})
