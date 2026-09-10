import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCotizacionByIdMock: vi.fn(),
  upsertItemsMock: vi.fn(async (_rows: Record<string, unknown>[]) => []),
  recalculateQuotationHeaderMock: vi.fn(),
  runQuotationNonCriticalAutosavesMock: vi.fn(async () => undefined),
  triggerSheetsSyncMock: vi.fn(),
  afterMock: vi.fn(),
  sendRealtimeBroadcastMock: vi.fn(async () => undefined),
}))

vi.mock('next/server', () => ({ after: mocks.afterMock }))
vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCotizacionById: mocks.getCotizacionByIdMock,
  upsertItems: mocks.upsertItemsMock,
}))
vi.mock('@/lib/server/quotations/persistence', () => ({
  recalculateQuotationHeader: mocks.recalculateQuotationHeaderMock,
  runQuotationNonCriticalAutosaves: mocks.runQuotationNonCriticalAutosavesMock,
}))
vi.mock('@/lib/integrations/sheets/trigger', () => ({ triggerSheetsSync: mocks.triggerSheetsSyncMock }))
vi.mock('@/lib/server/realtime/broadcast', () => ({ sendRealtimeBroadcast: mocks.sendRealtimeBroadcastMock }))

import { POST } from '../cotizaciones/[id]/items/route'

const params = Promise.resolve({ id: 'SH001' })
const req = () => new Request('http://x/api/cotizaciones/SH001/items', { method: 'POST' })

const itemVacioDelServidor = {
  id: 'nueva-fila-id',
  categoria: '', descripcion: '', cantidad: 1, precio_unitario: 0, x_pagar: 0, revision: 0,
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

  it('numera el orden a partir del máximo existente', async () => {
    mocks.getCotizacionByIdMock.mockResolvedValue({
      id: 'SH001', cliente: 'ACME', proyecto: 'Spot',
      items: [{ id: 'a', orden: 4 }, { id: 'b', orden: 7 }],
    })

    await POST(req(), { params })

    const row = mocks.upsertItemsMock.mock.calls[0][0][0]
    expect(row.orden).toBe(8)
  })
})
