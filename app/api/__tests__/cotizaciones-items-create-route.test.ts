import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCotizacionByIdMock: vi.fn(),
  // Por default hace eco de las filas que recibe, como la RPC real cuando el
  // upsert sí aplica. Los tests del guard de UUID cruzado (Fase 8.7 Bloque 4)
  // sobreescriben esto a `[]` para simular el rechazo del WHERE del ON CONFLICT.
  upsertItemsMock: vi.fn(async (rows: Record<string, unknown>[]) => rows),
  recalculateQuotationHeaderMock: vi.fn(),
  runQuotationNonCriticalAutosavesMock: vi.fn(async () => undefined),
  triggerSheetsSyncMock: vi.fn(),
  afterMock: vi.fn(),
  sendRealtimeBroadcastMock: vi.fn(async () => undefined),
}))

vi.mock('next/server', () => ({ after: mocks.afterMock }))
vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
// Fase 8.7.1: reexporta la clase real de EstadoCotizacionInvalidoError (no un
// mock) para que el `instanceof` de la ruta funcione con el error que lanza
// upsertItemsMock en el test del guard de estado, de abajo.
vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/repositories/quotations')>('@/lib/server/repositories/quotations')
  return {
    getCotizacionById: mocks.getCotizacionByIdMock,
    upsertItems: mocks.upsertItemsMock,
    EstadoCotizacionInvalidoError: actual.EstadoCotizacionInvalidoError,
  }
})
vi.mock('@/lib/server/quotations/persistence', () => ({
  recalculateQuotationHeader: mocks.recalculateQuotationHeaderMock,
  runQuotationNonCriticalAutosaves: mocks.runQuotationNonCriticalAutosavesMock,
}))
vi.mock('@/lib/integrations/sheets/trigger', () => ({ triggerSheetsSync: mocks.triggerSheetsSyncMock }))
vi.mock('@/lib/server/realtime/broadcast', () => ({ sendRealtimeBroadcast: mocks.sendRealtimeBroadcastMock }))
// La ruta en sí no llama a supabaseAdmin (todo pasa por @/lib/db, mockeado
// arriba) -- este mock solo evita que `vi.importActual` de arriba, al cargar
// el módulo real de repositorios, intente crear un cliente de Supabase real
// sin las env vars.
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: {} }))

import { POST } from '../cotizaciones/[id]/items/route'
import { EstadoCotizacionInvalidoError } from '@/lib/db'

const params = Promise.resolve({ id: 'SH001' })
const req = (body?: unknown) => new Request('http://x/api/cotizaciones/SH001/items', {
  method: 'POST',
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const itemVacioDelServidor = {
  id: 'nueva-fila-id',
  categoria: '', descripcion: '', cantidad: 1, precio_unitario: 0, x_pagar: 0, revision: 0,
}

/**
 * EF-2 1D-1: el broadcast ahora se agenda vía `after()` (antes era
 * fire-and-forget directo) -- `afterMock` es un `vi.fn()` que solo
 * REGISTRA el callback, nunca lo ejecuta solo. Este helper invoca todos
 * los callbacks agendados en la request (autosaves no críticos + el
 * broadcast), igual que Next.js haría tras enviar la respuesta.
 */
async function flushAfter() {
  const calls = mocks.afterMock.mock.calls.map((call: unknown[]) => call[0] as () => Promise<void>)
  for (const cb of calls) await cb()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.getCotizacionByIdMock.mockResolvedValue({ id: 'SH001', cliente: 'ACME', proyecto: 'Spot', items: [] })
  mocks.recalculateQuotationHeaderMock.mockImplementation(async () => ({
    id: 'SH001', cliente: 'ACME', proyecto: 'Spot',
    items: [{ ...itemVacioDelServidor, id: mocks.upsertItemsMock.mock.calls[0][0][0].id }],
  }))
})

describe('POST /api/cotizaciones/[id]/items', () => {
  it('crea una fila en blanco y emite item_confirmed operation=create tras el commit', async () => {
    const res = await POST(req(), { params })

    expect(res.status).toBe(200)
    const body = await res.json()
    const createdId = body.item.id
    await flushAfter()

    expect(mocks.sendRealtimeBroadcastMock).toHaveBeenCalledWith([{
      topic: 'cotizacion:SH001',
      event: 'item_confirmed',
      payload: {
        cotizacion_id: 'SH001',
        item_id: createdId,
        revision: 0,
        mutation_id: null,
        operation: 'create',
        at: expect.any(String),
      },
      private: true,
    }])
  })

  it('threadea el mutation_id del body al evento item_confirmed (Fase: colaboración)', async () => {
    const res = await POST(req({ mutation_id: 'mut-123' }), { params })

    expect(res.status).toBe(200)
    const body = await res.json()
    const createdId = body.item.id
    await flushAfter()

    expect(mocks.sendRealtimeBroadcastMock).toHaveBeenCalledWith([expect.objectContaining({
      payload: expect.objectContaining({ cotizacion_id: 'SH001', item_id: createdId, mutation_id: 'mut-123' }),
    })])
  })

  it('numera el orden a partir del máximo existente', async () => {
    mocks.getCotizacionByIdMock.mockResolvedValue({
      id: 'SH001', cliente: 'ACME', proyecto: 'Spot',
      items: [{ id: 'a', orden: 4 }, { id: 'b', orden: 7 }],
    })

    await POST(req(), { params })

    const row = mocks.upsertItemsMock.mock.calls[0][0][0]
    expect(row.orden).toBe(8)
  })

  describe('Fase 6B -- id estable generado por el cliente', () => {
    it('usa el id que manda el cliente en vez de generar uno propio', async () => {
      const res = await POST(req({ id: CLIENT_ID }), { params })

      expect(res.status).toBe(200)
      const row = mocks.upsertItemsMock.mock.calls[0][0][0]
      expect(row.id).toBe(CLIENT_ID)
      const body = await res.json()
      expect(body.item.id).toBe(CLIENT_ID)
    })

    it('ignora un id que no tiene forma de UUID y genera uno propio', async () => {
      await POST(req({ id: 'no-es-un-uuid' }), { params })

      const row = mocks.upsertItemsMock.mock.calls[0][0][0]
      expect(row.id).not.toBe('no-es-un-uuid')
    })

    it('reintentar con el mismo id no crea una fila duplicada ni re-emite el evento', async () => {
      mocks.getCotizacionByIdMock.mockResolvedValue({
        id: 'SH001', cliente: 'ACME', proyecto: 'Spot',
        items: [{ id: CLIENT_ID, categoria: '', descripcion: 'ya creada', cantidad: 1, precio_unitario: 0, x_pagar: 0, orden: 0 }],
      })

      const res = await POST(req({ id: CLIENT_ID }), { params })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.item).toEqual({ id: CLIENT_ID, categoria: '', descripcion: 'ya creada', cantidad: 1, precio_unitario: 0, x_pagar: 0, orden: 0 })
      expect(mocks.upsertItemsMock).not.toHaveBeenCalled()
      expect(mocks.sendRealtimeBroadcastMock).not.toHaveBeenCalled()
    })
  })

  describe('Fase 8.7 Bloque 4 -- guard de UUID cruzado', () => {
    it('responde 409 cuando el id ya pertenece a una partida de otra cotización', async () => {
      // upsert_items_cotizacion rechaza el ON CONFLICT (el WHERE por cotizacion_id
      // no matchea) y no devuelve la fila -- exactamente lo que hace la RPC real.
      mocks.upsertItemsMock.mockResolvedValueOnce([])

      const res = await POST(req({ id: CLIENT_ID }), { params })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/otra cotización/)
      // Ninguna fila cambió: no hay recálculo, no hay evento confirmado.
      expect(mocks.recalculateQuotationHeaderMock).not.toHaveBeenCalled()
      expect(mocks.sendRealtimeBroadcastMock).not.toHaveBeenCalled()
    })
  })

  describe('Fase 8.7.1 -- guard de estado', () => {
    it('responde 409 cuando la cotización ya no está en BORRADOR/EMITIDA', async () => {
      mocks.upsertItemsMock.mockRejectedValueOnce(new EstadoCotizacionInvalidoError('APROBADA'))

      const res = await POST(req(), { params })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: 'estado_invalido',
        estado_actual: 'APROBADA',
        message: 'No se pueden modificar partidas de una cotización en estado APROBADA',
      })
      expect(mocks.recalculateQuotationHeaderMock).not.toHaveBeenCalled()
      expect(mocks.sendRealtimeBroadcastMock).not.toHaveBeenCalled()
    })
  })
})
