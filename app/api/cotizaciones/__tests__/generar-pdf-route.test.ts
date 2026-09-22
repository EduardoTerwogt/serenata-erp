import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getCotizacionByIdMock: vi.fn(),
  generateCotizacionPdfMock: vi.fn(),
  getByTipoMock: vi.fn(),
  createSpikeDocMock: vi.fn(),
  renderFromTemplateMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/db', () => ({
  getCotizacionById: mocks.getCotizacionByIdMock,
}))

vi.mock('@/lib/server/pdf/cotizacion-pdf', () => ({
  generateCotizacionPdf: mocks.generateCotizacionPdfMock,
}))

vi.mock('@/lib/server/repositories/pdf-plantillas', () => ({
  PdfPlantillasRepository: { getByTipo: mocks.getByTipoMock },
}))

vi.mock('@/lib/server/pdf/template-renderer', () => ({
  createSpikeDoc: mocks.createSpikeDocMock,
  renderFromTemplate: mocks.renderFromTemplateMock,
}))

import { GET } from '../[id]/generar-pdf/route'

const AUTH_OK = { session: { user: { id: 'user-1' } }, response: null }

const COTIZACION = {
  id: 'COT-1',
  cliente: 'ACME',
  proyecto: 'Concierto XYZ',
  fecha_entrega: '2026-11-14',
  locacion: null,
  fecha_cotizacion: '2026-09-20',
  items: [{ categoria: 'Equipo', descripcion: 'Cámara', cantidad: 2, precio_unitario: 5000, importe: 10000 }],
  subtotal: 10000,
  fee_agencia: 0,
  general: 10000,
  iva: 1600,
  total: 11600,
  iva_activo: true,
  porcentaje_fee: 0,
  descuento_tipo: 'monto',
  descuento_valor: 0,
  notas_pdf: null,
}

const VALID_TEMPLATE = {
  tipoDocumento: 'cotizacion' as const,
  page: { width: 210 as const, height: 297 as const, margins: { top: 10, right: 10, bottom: 10, left: 10 } },
  elements: [
    {
      id: 'el-1',
      x: 10,
      y: 10,
      w: 50,
      type: 'text' as const,
      text: 'Cliente: {{cliente}}',
      size: 10,
      bold: false,
      align: 'left' as const,
      colorToken: 'orange',
    },
  ],
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/cotizaciones/[id]/generar-pdf', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
    mocks.getCotizacionByIdMock.mockResolvedValue(COTIZACION)
    mocks.generateCotizacionPdfMock.mockReturnValue(new ArrayBuffer(4))
    mocks.createSpikeDocMock.mockReturnValue({ output: () => new ArrayBuffer(8) })
  })

  it('sin fila en pdf_plantillas usa el generador hardcodeado (documento no migrado)', async () => {
    mocks.getByTipoMock.mockResolvedValue(null)
    const res = await GET(new Request('http://localhost'), paramsFor('COT-1'))
    expect(res.status).toBe(200)
    expect(mocks.generateCotizacionPdfMock).toHaveBeenCalledWith(expect.objectContaining({ cliente: 'ACME' }))
    expect(mocks.renderFromTemplateMock).not.toHaveBeenCalled()
  })

  it('con active_schema válido usa renderFromTemplate() con el data-adapter (incluye descuento_monto)', async () => {
    mocks.getByTipoMock.mockResolvedValue({ active_schema: VALID_TEMPLATE, draft_schema: null })
    const res = await GET(new Request('http://localhost'), paramsFor('COT-1'))
    expect(res.status).toBe(200)
    expect(mocks.generateCotizacionPdfMock).not.toHaveBeenCalled()
    expect(mocks.renderFromTemplateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tipoDocumento: 'cotizacion' }),
      expect.objectContaining({ cliente: 'ACME', descuento_monto: 0 }),
      expect.any(Function)
    )
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
  })

  it('respeta ?mode=inline con el template migrado', async () => {
    mocks.getByTipoMock.mockResolvedValue({ active_schema: VALID_TEMPLATE, draft_schema: null })
    const res = await GET(new Request('http://localhost?mode=inline'), paramsFor('COT-1'))
    expect(res.headers.get('Content-Disposition')).toContain('inline')
  })

  it('active_schema inválido falla explícito (500), nunca cae de vuelta al generador viejo', async () => {
    mocks.getByTipoMock.mockResolvedValue({ active_schema: { elements: [] }, draft_schema: null })
    const res = await GET(new Request('http://localhost'), paramsFor('COT-1'))
    expect(res.status).toBe(500)
    expect(mocks.generateCotizacionPdfMock).not.toHaveBeenCalled()
    expect(mocks.renderFromTemplateMock).not.toHaveBeenCalled()
  })

  it('404 si la cotización no existe', async () => {
    mocks.getCotizacionByIdMock.mockResolvedValue(null)
    const res = await GET(new Request('http://localhost'), paramsFor('no-existe'))
    expect(res.status).toBe(404)
    expect(mocks.getByTipoMock).not.toHaveBeenCalled()
  })

  it('corta si no hay sección cotizaciones', async () => {
    mocks.requireSectionMock.mockResolvedValue({ session: null, response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    const res = await GET(new Request('http://localhost'), paramsFor('COT-1'))
    expect(res.status).toBe(403)
    expect(mocks.getCotizacionByIdMock).not.toHaveBeenCalled()
  })
})
