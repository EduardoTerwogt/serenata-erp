import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCotizacionByIdMock: vi.fn(),
  runQuotationNonCriticalAutosavesMock: vi.fn(async () => undefined),
  triggerSheetsSyncMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({ getCotizacionById: mocks.getCotizacionByIdMock }))
vi.mock('@/lib/server/quotations/persistence', () => ({
  runQuotationNonCriticalAutosaves: mocks.runQuotationNonCriticalAutosavesMock,
}))
vi.mock('@/lib/integrations/sheets/trigger', () => ({ triggerSheetsSync: mocks.triggerSheetsSyncMock }))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { PATCH as PATCH_GENERAL } from '../cotizaciones/[id]/general/route'
import { PATCH as PATCH_TOTALES } from '../cotizaciones/[id]/totales/route'

const params = Promise.resolve({ id: 'SH001' })
const req = (ruta: string, body: unknown) => new Request(`http://x/api/cotizaciones/SH001/${ruta}`, {
  method: 'PATCH',
  body: JSON.stringify(body),
})

const cotizacion = { id: 'SH001', cliente: 'ACME', proyecto: 'Spot', items: [{ id: 'item-1' }] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.rpcMock.mockResolvedValue({ data: cotizacion, error: null })
  mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)
})

/**
 * La garantía que fija la causa raíz de "se borran los montos" y "no puedo borrar las
 * filas": guardar una sección NO puede tocar las partidas. Antes pasaba por
 * save_cotizacion, que las borraba y reinsertaba con ids nuevos en cada tecleo.
 */
describe('PATCH /api/cotizaciones/[id]/general', () => {
  it('manda solo los campos recibidos y no incluye partidas', async () => {
    const res = await PATCH_GENERAL(req('general', { proyecto: 'Nuevo nombre' }), { params })

    expect(res.status).toBe(200)
    const [fn, args] = mocks.rpcMock.mock.calls[0]
    expect(fn).toBe('patch_cotizacion_general')
    expect(args).toEqual({ p_cotizacion_id: 'SH001', p_patch: { proyecto: 'Nuevo nombre' } })
    expect(JSON.stringify(args)).not.toContain('items')
  })

  it('permite vaciar locación y fecha de entrega', async () => {
    await PATCH_GENERAL(req('general', { locacion: null, fecha_entrega: null }), { params })
    expect(mocks.rpcMock.mock.calls[0][1].p_patch).toEqual({ fecha_entrega: '', locacion: '' })
  })

  it('responde 404 si la cotización no existe', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await PATCH_GENERAL(req('general', { proyecto: 'x' }), { params })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/cotizaciones/[id]/totales', () => {
  it('manda solo la configuración recibida y no incluye partidas', async () => {
    const res = await PATCH_TOTALES(req('totales', { porcentaje_fee: 0.2 }), { params })

    expect(res.status).toBe(200)
    const [fn, args] = mocks.rpcMock.mock.calls[0]
    expect(fn).toBe('patch_cotizacion_totales')
    expect(args).toEqual({ p_cotizacion_id: 'SH001', p_patch: { porcentaje_fee: 0.2 } })
    expect(JSON.stringify(args)).not.toContain('items')
  })

  it('respeta apagar el IVA y el descuento en cero', async () => {
    await PATCH_TOTALES(req('totales', { iva_activo: false, descuento_valor: 0 }), { params })
    expect(mocks.rpcMock.mock.calls[0][1].p_patch).toEqual({ iva_activo: false, descuento_valor: 0 })
  })

  it('responde 404 si la cotización no existe', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await PATCH_TOTALES(req('totales', { porcentaje_fee: 0.2 }), { params })
    expect(res.status).toBe(404)
  })
})
