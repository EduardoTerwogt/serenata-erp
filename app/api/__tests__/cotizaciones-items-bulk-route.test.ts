import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  recalculateQuotationHeaderMock: vi.fn(),
  runQuotationNonCriticalAutosavesMock: vi.fn(async () => undefined),
  triggerSheetsSyncMock: vi.fn(),
  afterMock: vi.fn(),
  sendRealtimeBroadcastMock: vi.fn(async () => undefined),
  rpcMock: vi.fn(),
  withIdempotencyMock: vi.fn(
    async (
      _scope: string,
      _key: string | null | undefined,
      handler: () => Promise<{ status: number; body: unknown }>
    ) => handler()
  ),
  computePayloadHashMock: vi.fn(() => 'fake-hash'),
}))

vi.mock('next/server', () => ({ after: mocks.afterMock }))
vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/quotations/persistence', () => ({
  recalculateQuotationHeader: mocks.recalculateQuotationHeaderMock,
  runQuotationNonCriticalAutosaves: mocks.runQuotationNonCriticalAutosavesMock,
}))
vi.mock('@/lib/integrations/sheets/trigger', () => ({ triggerSheetsSync: mocks.triggerSheetsSyncMock }))
vi.mock('@/lib/server/realtime/broadcast', () => ({ sendRealtimeBroadcast: mocks.sendRealtimeBroadcastMock }))
vi.mock('@/lib/server/idempotency', () => ({
  withIdempotency: mocks.withIdempotencyMock,
  computePayloadHash: mocks.computePayloadHashMock,
}))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { POST } from '../cotizaciones/[id]/items/bulk/route'

const params = Promise.resolve({ id: 'SH001' })
const req = (body: unknown) =>
  new Request('http://x/api/cotizaciones/SH001/items/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
  })

const OP_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID_1 = '22222222-2222-4222-8222-222222222222'
const ITEM_ID_2 = '33333333-3333-4333-8333-333333333333'

const item = (over: Record<string, unknown> = {}) => ({
  id: ITEM_ID_1,
  categoria: 'Producción',
  descripcion: 'Cámara',
  cantidad: 1,
  precio_unitario: 10000,
  importe: 10000,
  x_pagar: 4000,
  margen: 6000,
  responsable_id: null,
  responsable_nombre: null,
  orden: 0,
  notas: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.withIdempotencyMock.mockImplementation(
    async (
      _scope: string,
      _key: string | null | undefined,
      handler: () => Promise<{ status: number; body: unknown }>
    ) => handler()
  )
  mocks.computePayloadHashMock.mockReturnValue('fake-hash')
  mocks.rpcMock.mockResolvedValue({ data: { items: [] }, error: null })
  mocks.recalculateQuotationHeaderMock.mockResolvedValue({ id: 'SH001', cliente: 'ACME', proyecto: 'Spot', items: [] })
})

describe('POST /api/cotizaciones/[id]/items/bulk', () => {
  it('rechaza una petición sin partidas', async () => {
    const res = await POST(req({ items: [], operation_id: OP_ID }), { params })
    expect(res.status).toBe(400)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('rechaza sin operation_id (uuid)', async () => {
    const res = await POST(req({ items: [item()] }), { params })
    expect(res.status).toBe(400)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('rechaza si operation_id no es un uuid válido', async () => {
    const res = await POST(req({ items: [item()], operation_id: 'no-es-uuid' }), { params })
    expect(res.status).toBe(400)
  })

  it('rechaza si alguna partida no trae id (uuid) generado por el cliente', async () => {
    const res = await POST(req({ items: [item({ id: undefined })], operation_id: OP_ID }), { params })
    expect(res.status).toBe(400)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('llama a la RPC transaccional con operation_id, cotizacion_id, items y reemplazar_ids filtrados', async () => {
    await POST(
      req({
        items: [item(), item({ id: ITEM_ID_2, descripcion: 'Luz' })],
        reemplazar_ids: [
          { id: ITEM_ID_1, revision: 0 },
          { id: 'sin-revision' }, // filtrado -- no trae revision numérica
        ],
        operation_id: OP_ID,
      }),
      { params }
    )

    expect(mocks.rpcMock).toHaveBeenCalledWith('bulk_replace_items_cotizacion', {
      p_operation_id: OP_ID,
      p_cotizacion_id: 'SH001',
      p_items: [item(), item({ id: ITEM_ID_2, descripcion: 'Luz' })],
      p_reemplazar_ids: [{ id: ITEM_ID_1, revision: 0 }],
    })
  })

  it('usa scope ligado a la cotización y pasa payloadHash a withIdempotency', async () => {
    await POST(req({ items: [item()], operation_id: OP_ID }), { params })

    expect(mocks.withIdempotencyMock).toHaveBeenCalledWith(
      'cotizaciones_items_bulk:SH001',
      OP_ID,
      expect.any(Function),
      { payloadHash: 'fake-hash' }
    )
  })

  it('éxito: recalcula encabezado, sincroniza Sheets, emite item_confirmed y responde 200 con la cotización', async () => {
    const res = await POST(req({ items: [item(), item({ id: ITEM_ID_2, descripcion: 'Luz' })], operation_id: OP_ID }), { params })

    expect(res.status).toBe(200)
    expect(mocks.recalculateQuotationHeaderMock).toHaveBeenCalledWith('SH001')
    expect(mocks.triggerSheetsSyncMock).toHaveBeenCalledWith('cotizaciones', 'items_cotizacion')
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
    const body = await res.json()
    expect(body.cotizacion).toEqual({ id: 'SH001', cliente: 'ACME', proyecto: 'Spot', items: [] })
  })

  it('difiere los autoguardados de catálogo fuera de la respuesta', async () => {
    await POST(req({ items: [item()], operation_id: OP_ID }), { params })

    expect(mocks.afterMock).toHaveBeenCalledTimes(1)
    expect(mocks.runQuotationNonCriticalAutosavesMock).not.toHaveBeenCalled()
  })

  it('estado_invalido de la RPC -- responde 409, sin recalcular ni emitir evento', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { estado_invalido: true, estado_actual: 'CANCELADA' }, error: null })

    const res = await POST(req({ items: [item()], operation_id: OP_ID }), { params })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'estado_invalido',
      estado_actual: 'CANCELADA',
      message: 'No se pueden modificar partidas de una cotización en estado CANCELADA',
    })
    expect(mocks.recalculateQuotationHeaderMock).not.toHaveBeenCalled()
    expect(mocks.sendRealtimeBroadcastMock).not.toHaveBeenCalled()
  })

  it('P1409 (identidad cruzada) -- responde 409 sin recalcular', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code: 'P1409', message: 'id ya pertenece a otra cotizacion' } })

    const res = await POST(req({ items: [item()], operation_id: OP_ID }), { params })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('identidad_cruzada')
    expect(mocks.recalculateQuotationHeaderMock).not.toHaveBeenCalled()
  })

  it('P1410 (conflicto de revision) -- responde 409 sin recalcular', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code: 'P1410', message: 'conflicto de revision', details: '[]' } })

    const res = await POST(req({ items: [item()], operation_id: OP_ID }), { params })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('conflict')
  })

  it('P1412 (operation_id de otra cotización) -- responde 409 sin recalcular', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code: 'P1412', message: 'operation_id ya pertenece a otra cotizacion' } })

    const res = await POST(req({ items: [item()], operation_id: OP_ID }), { params })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('operation_id_cruzado')
  })

  it('error de RPC sin código reconocido -- 500, sin recalcular', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection refused' } })

    const res = await POST(req({ items: [item()], operation_id: OP_ID }), { params })

    expect(res.status).toBe(500)
    expect(mocks.recalculateQuotationHeaderMock).not.toHaveBeenCalled()
  })
})
