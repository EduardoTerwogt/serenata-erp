import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCotizacionByIdMock: vi.fn(),
  upsertItemsMock: vi.fn(async (_rows: Record<string, unknown>[]) => []),
  findOrCreateProveedorByNombreMock: vi.fn(),
  recalculateQuotationHeaderMock: vi.fn(),
  runQuotationNonCriticalAutosavesMock: vi.fn(async () => undefined),
  triggerSheetsSyncMock: vi.fn(),
  deleteMock: vi.fn(),
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
    findOrCreateProveedorByNombre: mocks.findOrCreateProveedorByNombreMock,
    EstadoCotizacionInvalidoError: actual.EstadoCotizacionInvalidoError,
  }
})
vi.mock('@/lib/server/quotations/persistence', () => ({
  recalculateQuotationHeader: mocks.recalculateQuotationHeaderMock,
  runQuotationNonCriticalAutosaves: mocks.runQuotationNonCriticalAutosavesMock,
}))
vi.mock('@/lib/integrations/sheets/trigger', () => ({ triggerSheetsSync: mocks.triggerSheetsSyncMock }))
vi.mock('@/lib/server/realtime/broadcast', () => ({ sendRealtimeBroadcast: mocks.sendRealtimeBroadcastMock }))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({ delete: () => ({ eq: () => ({ in: mocks.deleteMock }) }) }),
  },
}))

import { POST } from '../cotizaciones/[id]/items/bulk/route'
import { EstadoCotizacionInvalidoError } from '@/lib/db'

const params = Promise.resolve({ id: 'SH001' })
const req = (body: unknown) => new Request('http://x/api/cotizaciones/SH001/items/bulk', {
  method: 'POST',
  body: JSON.stringify(body),
})

const item = (over: Record<string, unknown> = {}) => ({
  categoria: 'Producción', descripcion: 'Cámara', cantidad: 1, precio_unitario: 10000, x_pagar: 4000, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.getCotizacionByIdMock.mockResolvedValue({ id: 'SH001', cliente: 'ACME', proyecto: 'Spot', items: [] })
  mocks.recalculateQuotationHeaderMock.mockResolvedValue({ id: 'SH001', cliente: 'ACME', proyecto: 'Spot', items: [] })
  mocks.deleteMock.mockResolvedValue({ error: null })
})

describe('POST /api/cotizaciones/[id]/items/bulk', () => {
  it('crea todas las partidas con un solo upsert', async () => {
    const res = await POST(req({ items: [item(), item({ descripcion: 'Luz' }), item({ descripcion: 'Grip' })] }), { params })

    expect(res.status).toBe(200)
    expect(mocks.upsertItemsMock).toHaveBeenCalledTimes(1)
    const rows = mocks.upsertItemsMock.mock.calls[0][0]
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.descripcion)).toEqual(['Cámara', 'Luz', 'Grip'])
    // Y un solo recálculo de encabezado, no uno por fila.
    expect(mocks.recalculateQuotationHeaderMock).toHaveBeenCalledTimes(1)
  })

  it('numera el orden a partir del máximo existente', async () => {
    mocks.getCotizacionByIdMock.mockResolvedValue({
      id: 'SH001', cliente: 'ACME', proyecto: 'Spot',
      items: [{ id: 'a', orden: 4 }, { id: 'b', orden: 7 }],
    })

    await POST(req({ items: [item(), item()] }), { params })

    const rows = mocks.upsertItemsMock.mock.calls[0][0]
    expect(rows.map((r) => r.orden)).toEqual([8, 9])
  })

  it('reutiliza las filas en blanco indicadas y conserva su posición', async () => {
    mocks.getCotizacionByIdMock.mockResolvedValue({
      id: 'SH001', cliente: 'ACME', proyecto: 'Spot',
      items: [{ id: 'blank-1', orden: 0, notas: 'nota previa' }, { id: 'blank-2', orden: 1 }],
    })

    await POST(req({ items: [item({ descripcion: 'Uno' }), item({ descripcion: 'Dos' })], reemplazar_ids: ['blank-1', 'blank-2'] }), { params })

    const rows = mocks.upsertItemsMock.mock.calls[0][0]
    expect(rows.map((r) => r.id)).toEqual(['blank-1', 'blank-2'])
    expect(rows.map((r) => r.orden)).toEqual([0, 1])
    expect(rows[0].notas).toBe('nota previa')
    expect(mocks.deleteMock).not.toHaveBeenCalled()
  })

  it('borra las filas en blanco que sobran', async () => {
    mocks.getCotizacionByIdMock.mockResolvedValue({
      id: 'SH001', cliente: 'ACME', proyecto: 'Spot',
      items: [{ id: 'blank-1', orden: 0 }, { id: 'blank-2', orden: 1 }, { id: 'blank-3', orden: 2 }],
    })

    await POST(req({ items: [item()], reemplazar_ids: ['blank-1', 'blank-2', 'blank-3'] }), { params })

    expect(mocks.deleteMock).toHaveBeenCalledWith('id', ['blank-2', 'blank-3'])
  })

  it('resuelve los responsables por nombre una sola vez por nombre', async () => {
    mocks.findOrCreateProveedorByNombreMock.mockImplementation(async (nombre: string) => ({ id: `p-${nombre}`, nombre }))

    await POST(req({
      items: [
        item({ responsable_nombre: 'Ana' }),
        item({ responsable_nombre: 'Ana' }),
        item({ responsable_nombre: 'Beto' }),
      ],
    }), { params })

    expect(mocks.findOrCreateProveedorByNombreMock).toHaveBeenCalledTimes(2)
    const rows = mocks.upsertItemsMock.mock.calls[0][0]
    expect(rows.map((r) => r.responsable_id)).toEqual(['p-Ana', 'p-Ana', 'p-Beto'])
  })

  it('difiere los autoguardados de catálogo fuera de la respuesta', async () => {
    await POST(req({ items: [item()] }), { params })

    expect(mocks.afterMock).toHaveBeenCalledTimes(1)
    expect(mocks.runQuotationNonCriticalAutosavesMock).not.toHaveBeenCalled()
  })

  it('rechaza una petición sin partidas', async () => {
    const res = await POST(req({ items: [] }), { params })
    expect(res.status).toBe(400)
    expect(mocks.upsertItemsMock).not.toHaveBeenCalled()
  })

  it('emite un único item_confirmed operation=bulk tras el commit, sin partidas en el payload', async () => {
    await POST(req({ items: [item(), item({ descripcion: 'Luz' })] }), { params })

    expect(mocks.sendRealtimeBroadcastMock).toHaveBeenCalledTimes(1)
    expect(mocks.sendRealtimeBroadcastMock).toHaveBeenCalledWith([{
      topic: 'cotizacion:SH001',
      event: 'item_confirmed',
      payload: {
        cotizacion_id: 'SH001',
        item_id: null,
        revision: null,
        mutation_id: null,
        operation: 'bulk',
        at: expect.any(String),
      },
      private: true,
    }])
  })

  describe('Fase 8.7.1 -- guard de estado', () => {
    it('responde 409 cuando la cotización ya no está en BORRADOR/EMITIDA', async () => {
      mocks.upsertItemsMock.mockRejectedValueOnce(new EstadoCotizacionInvalidoError('CANCELADA'))

      const res = await POST(req({ items: [item()] }), { params })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: 'estado_invalido',
        estado_actual: 'CANCELADA',
        message: 'No se pueden modificar partidas de una cotización en estado CANCELADA',
      })
      expect(mocks.recalculateQuotationHeaderMock).not.toHaveBeenCalled()
      expect(mocks.sendRealtimeBroadcastMock).not.toHaveBeenCalled()
    })
  })
})
