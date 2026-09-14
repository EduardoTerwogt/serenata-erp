import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCotizacionByIdMock: vi.fn(),
  runQuotationNonCriticalAutosavesMock: vi.fn(async () => undefined),
  rpcMock: vi.fn(),
  // EF-2 1D-1: general/route.ts y totales/route.ts ahora importan `after`
  // de next/server para agendar el broadcast -- sin este mock, el `after()`
  // real revienta fuera de un scope de request real de Next.js.
  afterMock: vi.fn(),
  sendRealtimeBroadcastMock: vi.fn(async () => undefined),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({ getCotizacionById: mocks.getCotizacionByIdMock }))
vi.mock('@/lib/server/quotations/persistence', () => ({
  runQuotationNonCriticalAutosaves: mocks.runQuotationNonCriticalAutosavesMock,
}))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))
vi.mock('next/server', () => ({ after: mocks.afterMock }))
vi.mock('@/lib/server/realtime/broadcast', () => ({ sendRealtimeBroadcast: mocks.sendRealtimeBroadcastMock }))

import { PATCH as PATCH_GENERAL } from '../cotizaciones/[id]/general/route'
import { PATCH as PATCH_TOTALES } from '../cotizaciones/[id]/totales/route'

const params = Promise.resolve({ id: 'SH001' })
const req = (ruta: string, body: unknown) => new Request(`http://x/api/cotizaciones/SH001/${ruta}`, {
  method: 'PATCH',
  body: JSON.stringify(body),
})

const cotizacion = { id: 'SH001', cliente: 'ACME', proyecto: 'Spot', items: [{ id: 'item-1' }] }

/**
 * EF-2 1D-1: el broadcast se agenda vía `after()` -- `afterMock` solo
 * registra el callback, nunca lo ejecuta solo. Invoca el callback
 * agendado, igual que Next.js haría tras enviar la respuesta.
 */
async function flushAfter() {
  const calls = mocks.afterMock.mock.calls.map((call: unknown[]) => call[0] as () => Promise<void>)
  for (const cb of calls) await cb()
}

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
    expect(args).toEqual({ p_cotizacion_id: 'SH001', p_patch: { proyecto: 'Nuevo nombre' }, p_base: null })
    expect(JSON.stringify(args)).not.toContain('items')
  })

  it('agenda (after()) y emite general_confirmed tras el commit', async () => {
    await PATCH_GENERAL(req('general', { proyecto: 'Nuevo nombre' }), { params })

    expect(mocks.afterMock).toHaveBeenCalledTimes(1)
    expect(mocks.sendRealtimeBroadcastMock).not.toHaveBeenCalled()
    await flushAfter()
    expect(mocks.sendRealtimeBroadcastMock).toHaveBeenCalledWith([{
      topic: 'cotizacion:SH001',
      event: 'general_confirmed',
      payload: { cotizacion_id: 'SH001', at: expect.any(String) },
      private: true,
    }])
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

  describe('Fase 5 -- base y conflicto por campo', () => {
    it('manda p_base a la RPC cuando el body lo trae', async () => {
      await PATCH_GENERAL(req('general', { locacion: 'Tijuana', base: { locacion: 'CDMX' } }), { params })

      expect(mocks.rpcMock.mock.calls[0][1]).toEqual({
        p_cotizacion_id: 'SH001',
        p_patch: { locacion: 'Tijuana' },
        p_base: { locacion: 'CDMX' },
      })
    })

    it('responde 409 estructurado cuando la RPC devuelve un conflicto', async () => {
      mocks.rpcMock.mockResolvedValue({
        data: { conflict: { locacion: { base: 'CDMX', current: 'Puebla', attempted: 'Tijuana' } } },
        error: null,
      })

      const res = await PATCH_GENERAL(req('general', { locacion: 'Tijuana', base: { locacion: 'CDMX' } }), { params })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: 'conflict',
        entity: 'cotizacion_general',
        id: 'SH001',
        fields: { locacion: { base: 'CDMX', current: 'Puebla', attempted: 'Tijuana' } },
      })
    })
  })
})

describe('PATCH /api/cotizaciones/[id]/totales', () => {
  it('manda solo la configuración recibida y no incluye partidas', async () => {
    const res = await PATCH_TOTALES(req('totales', { porcentaje_fee: 0.2 }), { params })

    expect(res.status).toBe(200)
    const [fn, args] = mocks.rpcMock.mock.calls[0]
    expect(fn).toBe('patch_cotizacion_totales')
    expect(args).toEqual({ p_cotizacion_id: 'SH001', p_patch: { porcentaje_fee: 0.2 }, p_base: null })
    expect(JSON.stringify(args)).not.toContain('items')
  })

  it('agenda (after()) y emite totales_confirmed tras el commit', async () => {
    await PATCH_TOTALES(req('totales', { porcentaje_fee: 0.2 }), { params })

    expect(mocks.afterMock).toHaveBeenCalledTimes(1)
    expect(mocks.sendRealtimeBroadcastMock).not.toHaveBeenCalled()
    await flushAfter()
    expect(mocks.sendRealtimeBroadcastMock).toHaveBeenCalledWith([{
      topic: 'cotizacion:SH001',
      event: 'totales_confirmed',
      payload: { cotizacion_id: 'SH001', at: expect.any(String) },
      private: true,
    }])
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

  describe('Fase 5 -- base y conflicto por campo', () => {
    it('manda p_base a la RPC cuando el body lo trae', async () => {
      await PATCH_TOTALES(req('totales', { descuento_valor: 500, base: { descuento_valor: 0 } }), { params })

      expect(mocks.rpcMock.mock.calls[0][1]).toEqual({
        p_cotizacion_id: 'SH001',
        p_patch: { descuento_valor: 500 },
        p_base: { descuento_valor: 0 },
      })
    })

    it('responde 409 estructurado cuando la RPC devuelve un conflicto', async () => {
      mocks.rpcMock.mockResolvedValue({
        data: { conflict: { descuento_valor: { base: 0, current: 200, attempted: 500 } } },
        error: null,
      })

      const res = await PATCH_TOTALES(req('totales', { descuento_valor: 500, base: { descuento_valor: 0 } }), { params })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: 'conflict',
        entity: 'cotizacion_totales',
        id: 'SH001',
        fields: { descuento_valor: { base: 0, current: 200, attempted: 500 } },
      })
    })
  })
})
