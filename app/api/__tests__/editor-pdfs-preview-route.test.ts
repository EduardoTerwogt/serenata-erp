import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getByTipoMock: vi.fn(),
  createSpikeDocMock: vi.fn(),
  renderFromTemplateMock: vi.fn(),
  buildSampleDataMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/server/repositories/pdf-plantillas', () => ({
  PdfPlantillasRepository: { getByTipo: mocks.getByTipoMock },
}))

vi.mock('@/lib/server/pdf/pdf-sample-data', () => ({
  buildSampleData: mocks.buildSampleDataMock,
}))

vi.mock('@/lib/server/pdf/template-renderer', () => ({
  createSpikeDoc: mocks.createSpikeDocMock,
  renderFromTemplate: mocks.renderFromTemplateMock,
}))

import { GET } from '../editor-pdfs/[tipo]/preview/route'

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

const AUTH_OK = { session: { user: { id: 'user-1' } }, response: null }
const AUTH_DENIED = { session: null, response: Response.json({ error: 'No autorizado' }, { status: 403 }) }

function paramsFor(tipo: string) {
  return { params: Promise.resolve({ tipo }) }
}

describe('GET /api/editor-pdfs/[tipo]/preview', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.buildSampleDataMock.mockReturnValue({ cliente: 'Ejemplo' })
    mocks.createSpikeDocMock.mockReturnValue({ output: () => new ArrayBuffer(8) })
  })

  it('corta si no hay sección editor-pdfs', async () => {
    mocks.requireSectionMock.mockResolvedValue(AUTH_DENIED)
    const res = await GET(new Request('http://localhost'), paramsFor('cotizacion'))
    expect(res.status).toBe(403)
    expect(mocks.getByTipoMock).not.toHaveBeenCalled()
  })

  it('rechaza un tipo de documento inválido', async () => {
    mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
    const res = await GET(new Request('http://localhost'), paramsFor('no-existe'))
    expect(res.status).toBe(400)
  })

  it('404 si el documento no está migrado', async () => {
    mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
    mocks.getByTipoMock.mockResolvedValue(null)
    const res = await GET(new Request('http://localhost'), paramsFor('cotizacion'))
    expect(res.status).toBe(404)
  })

  it('400 si el schema (draft o active) tiene errores estructurales', async () => {
    mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
    mocks.getByTipoMock.mockResolvedValue({ active_schema: { elements: [] }, draft_schema: null })
    const res = await GET(new Request('http://localhost'), paramsFor('cotizacion'))
    expect(res.status).toBe(400)
    expect(mocks.renderFromTemplateMock).not.toHaveBeenCalled()
  })

  it('prioriza draft_schema sobre active_schema', async () => {
    mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
    mocks.getByTipoMock.mockResolvedValue({ active_schema: { ...VALID_TEMPLATE, elements: [] }, draft_schema: VALID_TEMPLATE })
    const res = await GET(new Request('http://localhost'), paramsFor('cotizacion'))
    expect(res.status).toBe(200)
    expect(mocks.renderFromTemplateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tipoDocumento: 'cotizacion' }),
      { cliente: 'Ejemplo' },
      expect.any(Function)
    )
  })

  it('devuelve el PDF con Content-Disposition inline', async () => {
    mocks.requireSectionMock.mockResolvedValue(AUTH_OK)
    mocks.getByTipoMock.mockResolvedValue({ active_schema: VALID_TEMPLATE, draft_schema: null })
    const res = await GET(new Request('http://localhost'), paramsFor('cotizacion'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('inline')
  })
})
