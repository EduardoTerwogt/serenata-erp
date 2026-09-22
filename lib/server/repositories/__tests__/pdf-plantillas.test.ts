import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: { from: mocks.fromMock },
}))

import { PdfPlantillasRepository } from '../pdf-plantillas'

function chain(result: { data: unknown; error: unknown }) {
  const c = {
    select: vi.fn(() => c),
    insert: vi.fn((_arg: Record<string, unknown>) => c),
    update: vi.fn((_arg: Record<string, unknown>) => c),
    eq: vi.fn(() => c),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  }
  return c
}

const SAMPLE_TEMPLATE = {
  tipoDocumento: 'cotizacion' as const,
  page: { width: 210 as const, height: 297 as const, margins: { top: 10, right: 10, bottom: 10, left: 10 } },
  elements: [],
}

describe('PdfPlantillasRepository', () => {
  beforeEach(() => {
    mocks.fromMock.mockReset()
  })

  it('getByTipo devuelve null si no hay fila (documento no migrado)', async () => {
    mocks.fromMock.mockReturnValue(chain({ data: null, error: null }))
    const result = await PdfPlantillasRepository.getByTipo('cotizacion')
    expect(result).toBeNull()
    expect(mocks.fromMock).toHaveBeenCalledWith('pdf_plantillas')
  })

  it('getByTipo propaga el error de Supabase', async () => {
    mocks.fromMock.mockReturnValue(chain({ data: null, error: new Error('conexión perdida') }))
    await expect(PdfPlantillasRepository.getByTipo('cotizacion')).rejects.toThrow('Failed to fetch pdf_plantillas')
  })

  it('saveDraft actualiza draft_schema/draft_updated_at/by sin tocar active_schema', async () => {
    const c = chain({ data: { id: 'row-1', draft_schema: SAMPLE_TEMPLATE }, error: null })
    mocks.fromMock.mockReturnValue(c)

    await PdfPlantillasRepository.saveDraft('cotizacion', SAMPLE_TEMPLATE, 'user-1')

    const updateArg = c.update.mock.calls[0][0]
    expect(updateArg).toHaveProperty('draft_schema', SAMPLE_TEMPLATE)
    expect(updateArg).toHaveProperty('draft_updated_by', 'user-1')
    expect(updateArg).not.toHaveProperty('active_schema')
  })

  it('discardDraft borra draft_schema/draft_updated_at/by, sin active_schema', async () => {
    const c = chain({ data: { id: 'row-1', draft_schema: null }, error: null })
    mocks.fromMock.mockReturnValue(c)

    await PdfPlantillasRepository.discardDraft('cotizacion')

    const updateArg = c.update.mock.calls[0][0]
    expect(updateArg).toEqual({ draft_schema: null, draft_updated_at: null, draft_updated_by: null })
  })

  it('aplicar promueve draft a active_schema y limpia el draft', async () => {
    const c = chain({ data: { id: 'row-1', active_schema: SAMPLE_TEMPLATE, draft_schema: null }, error: null })
    mocks.fromMock.mockReturnValue(c)

    await PdfPlantillasRepository.aplicar('cotizacion', SAMPLE_TEMPLATE, 'user-1')

    const updateArg = c.update.mock.calls[0][0]
    expect(updateArg.active_schema).toEqual(SAMPLE_TEMPLATE)
    expect(updateArg.draft_schema).toBeNull()
    expect(updateArg.applied_by).toBe('user-1')
    expect(updateArg.applied_at).toEqual(expect.any(String))
  })

  it.each(['cotizacion', 'hoja_llamado', 'reporte_cierre', 'orden_pago'] as const)(
    'migrar inserta la primera fila de %s con el baseline real',
    async tipo => {
      const c = chain({ data: { id: 'row-1', tipo_documento: tipo }, error: null })
      mocks.fromMock.mockReturnValue(c)

      await PdfPlantillasRepository.migrar(tipo, 'user-1')

      const insertArg = c.insert.mock.calls[0][0]
      expect(insertArg.tipo_documento).toBe(tipo)
      expect(insertArg.active_schema).toMatchObject({ tipoDocumento: tipo })
      expect(insertArg.applied_by).toBe('user-1')
      expect(insertArg.applied_at).toEqual(expect.any(String))
    }
  )

  it.each(['cotizacion', 'hoja_llamado', 'reporte_cierre', 'orden_pago'] as const)(
    'restaurar usa el baseline real de %s',
    async tipo => {
      const c = chain({ data: { id: 'row-1', active_schema: SAMPLE_TEMPLATE }, error: null })
      mocks.fromMock.mockReturnValue(c)

      await PdfPlantillasRepository.restaurar(tipo, 'user-1')

      const updateArg = c.update.mock.calls[0][0]
      expect(updateArg.active_schema).toMatchObject({ tipoDocumento: tipo })
    }
  )
})
