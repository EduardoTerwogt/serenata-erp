import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  findOrCreateProveedorByNombreMock: vi.fn(),
  recalculateQuotationHeaderMock: vi.fn(),
  runQuotationNonCriticalAutosavesMock: vi.fn(async () => undefined),
  triggerSheetsSyncMock: vi.fn(),
  rpcMock: vi.fn(),
  afterMock: vi.fn(),
  sendRealtimeBroadcastMock: vi.fn(async () => undefined),
  withIdempotencyMock: vi.fn(async (_scope: string, _key: string | null | undefined, handler: () => Promise<{ status: number; body: unknown }>) => handler()),
  deleteEqMock: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
}))

vi.mock('next/server', () => ({ after: mocks.afterMock }))
vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({ findOrCreateProveedorByNombre: mocks.findOrCreateProveedorByNombreMock }))
vi.mock('@/lib/server/quotations/persistence', () => ({
  recalculateQuotationHeader: mocks.recalculateQuotationHeaderMock,
  runQuotationNonCriticalAutosaves: mocks.runQuotationNonCriticalAutosavesMock,
}))
vi.mock('@/lib/integrations/sheets/trigger', () => ({ triggerSheetsSync: mocks.triggerSheetsSyncMock }))
vi.mock('@/lib/server/realtime/broadcast', () => ({ sendRealtimeBroadcast: mocks.sendRealtimeBroadcastMock }))
vi.mock('@/lib/server/idempotency', () => ({ withIdempotency: mocks.withIdempotencyMock }))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc: mocks.rpcMock,
    from: () => ({ delete: () => ({ eq: () => ({ eq: mocks.deleteEqMock }) }) }),
  },
}))

import { PATCH, DELETE } from '../cotizaciones/[id]/items/[itemId]/route'

const ITEM_ID = '11111111-1111-4111-8111-111111111111'
const params = Promise.resolve({ id: 'SH001', itemId: ITEM_ID })
const req = (body: unknown) => new Request(`http://x/api/cotizaciones/SH001/items/${ITEM_ID}`, {
  method: 'PATCH',
  body: JSON.stringify(body),
})

const itemDelServidor = {
  id: ITEM_ID,
  descripcion: 'Cámara escrita por A',
  cantidad: 1,
  precio_unitario: 7777,
  x_pagar: 0,
  importe: 7777,
  margen: 7777,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.rpcMock.mockResolvedValue({ data: itemDelServidor, error: null })
  mocks.recalculateQuotationHeaderMock.mockResolvedValue({
    id: 'SH001', cliente: 'ACME', proyecto: 'Spot', items: [itemDelServidor],
  })
})

describe('PATCH /api/cotizaciones/[id]/items/[itemId]', () => {
  /**
   * La garantía central: el servidor ya no reescribe la fila entera. Si el patch
   * llevara campos que el usuario no tocó, dos personas editando celdas distintas de
   * la misma fila volverían a pisarse -- el bug que encontraron las pruebas de
   * colaboración real.
   */
  it('manda a la RPC solo los campos que llegaron en el body', async () => {
    const res = await PATCH(req({ descripcion: 'Cámara escrita por A' }), { params })

    expect(res.status).toBe(200)
    expect(mocks.rpcMock).toHaveBeenCalledTimes(1)
    const [fn, args] = mocks.rpcMock.mock.calls[0]
    expect(fn).toBe('patch_item_cotizacion')
    expect(args).toEqual({
      p_cotizacion_id: 'SH001',
      p_item_id: ITEM_ID,
      p_patch: { descripcion: 'Cámara escrita por A' },
      p_base: null,
    })
    expect(Object.keys(args.p_patch)).not.toContain('precio_unitario')
    expect(Object.keys(args.p_patch)).not.toContain('cantidad')
  })

  it('normaliza los numéricos y respeta el cero', async () => {
    await PATCH(req({ x_pagar: 0 }), { params })
    expect(mocks.rpcMock.mock.calls[0][1].p_patch).toEqual({ x_pagar: 0 })

    mocks.rpcMock.mockClear()
    await PATCH(req({ precio_unitario: '1500' }), { params })
    expect(mocks.rpcMock.mock.calls[0][1].p_patch).toEqual({ precio_unitario: 1500 })
  })

  it('resuelve un responsable por nombre libre antes de llamar a la RPC', async () => {
    mocks.findOrCreateProveedorByNombreMock.mockResolvedValue({ id: 'prov-1', nombre: 'Juan Pérez' })

    await PATCH(req({ responsable_nombre: 'juan perez' }), { params })

    expect(mocks.findOrCreateProveedorByNombreMock).toHaveBeenCalledWith('juan perez')
    expect(mocks.rpcMock.mock.calls[0][1].p_patch).toEqual({
      responsable_id: 'prov-1',
      responsable_nombre: 'Juan Pérez',
    })
  })

  it('no busca proveedor cuando ya viene el id', async () => {
    await PATCH(req({ responsable_id: 'prov-9', responsable_nombre: 'Juan Pérez' }), { params })

    expect(mocks.findOrCreateProveedorByNombreMock).not.toHaveBeenCalled()
    expect(mocks.rpcMock.mock.calls[0][1].p_patch).toEqual({
      responsable_id: 'prov-9',
      responsable_nombre: 'Juan Pérez',
    })
  })

  it('permite desasignar el responsable', async () => {
    await PATCH(req({ responsable_id: '', responsable_nombre: '' }), { params })

    expect(mocks.findOrCreateProveedorByNombreMock).not.toHaveBeenCalled()
    expect(mocks.rpcMock.mock.calls[0][1].p_patch).toEqual({ responsable_id: '', responsable_nombre: '' })
  })

  it('responde 404 cuando la RPC no encuentra la partida', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: null })

    const res = await PATCH(req({ descripcion: 'x' }), { params })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Partida no encontrada' })
    expect(mocks.recalculateQuotationHeaderMock).not.toHaveBeenCalled()
  })

  it('responde 500 si la RPC falla', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: new Error('boom') })

    const res = await PATCH(req({ descripcion: 'x' }), { params })

    expect(res.status).toBe(500)
    expect(mocks.recalculateQuotationHeaderMock).not.toHaveBeenCalled()
  })

  it('recalcula el encabezado, sincroniza a Sheets y devuelve la partida', async () => {
    const res = await PATCH(req({ descripcion: 'Cámara escrita por A' }), { params })

    expect(mocks.recalculateQuotationHeaderMock).toHaveBeenCalledWith('SH001')
    expect(mocks.triggerSheetsSyncMock).toHaveBeenCalledWith('cotizaciones', 'items_cotizacion')
    expect(mocks.afterMock).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ item: itemDelServidor })
  })

  describe('Fase 2 -- base, conflicto, mutation_id', () => {
    it('manda p_base a la RPC cuando el body lo trae', async () => {
      await PATCH(req({ precio_unitario: 8500, base: { precio_unitario: 8000 } }), { params })

      expect(mocks.rpcMock.mock.calls[0][1]).toEqual({
        p_cotizacion_id: 'SH001',
        p_item_id: ITEM_ID,
        p_patch: { precio_unitario: 8500 },
        p_base: { precio_unitario: 8000 },
      })
    })

    it('responde 409 estructurado cuando la RPC devuelve un conflicto, sin recalcular el encabezado', async () => {
      mocks.rpcMock.mockResolvedValue({
        data: { conflict: { precio_unitario: { base: 8000, current: 8500, attempted: 7500 } } },
        error: null,
      })

      const res = await PATCH(req({ precio_unitario: 7500, base: { precio_unitario: 8000 } }), { params })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: 'conflict',
        entity: 'item_cotizacion',
        id: ITEM_ID,
        fields: { precio_unitario: { base: 8000, current: 8500, attempted: 7500 } },
      })
      expect(mocks.recalculateQuotationHeaderMock).not.toHaveBeenCalled()
      expect(mocks.sendRealtimeBroadcastMock).not.toHaveBeenCalled()
    })

    it('sin base, sigue sobreescribiendo sin comparar (retrocompatible con la UI actual)', async () => {
      await PATCH(req({ precio_unitario: 8500 }), { params })

      expect(mocks.rpcMock.mock.calls[0][1].p_base).toBeNull()
    })

    it('con mutation_id, envuelve el handler con withIdempotency usando un scope por cotización+item', async () => {
      await PATCH(req({ descripcion: 'x', mutation_id: 'mut-123' }), { params })

      expect(mocks.withIdempotencyMock).toHaveBeenCalledWith(
        `cotizacion-item-patch:SH001:${ITEM_ID}`,
        'mut-123',
        expect.any(Function)
      )
    })

    it('sin mutation_id, withIdempotency recibe undefined como key (corre el handler directo)', async () => {
      await PATCH(req({ descripcion: 'x' }), { params })

      expect(mocks.withIdempotencyMock.mock.calls[0][1]).toBeUndefined()
    })

    it('emite el broadcast con la revision y el mutation_id en el payload', async () => {
      mocks.recalculateQuotationHeaderMock.mockResolvedValue({
        id: 'SH001', cliente: 'ACME', proyecto: 'Spot', items: [{ ...itemDelServidor, revision: 3 }],
      })

      await PATCH(req({ descripcion: 'x', mutation_id: 'mut-abc' }), { params })

      expect(mocks.sendRealtimeBroadcastMock).toHaveBeenCalledWith([
        expect.objectContaining({
          topic: 'cotizacion:SH001',
          event: 'item_confirmed',
          private: true,
          payload: expect.objectContaining({ cotizacion_id: 'SH001', item_id: ITEM_ID, revision: 3, mutation_id: 'mut-abc' }),
        }),
      ])
    })

    it('si el recálculo de encabezado falla, igual responde 200 con la partida ya patcheada (no relanza)', async () => {
      mocks.recalculateQuotationHeaderMock.mockRejectedValue(new Error('recalculo caído'))

      const res = await PATCH(req({ descripcion: 'x' }), { params })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ item: itemDelServidor })
    })

    it('si la RPC lanza, el error sale del handler para que withIdempotency pueda limpiar la key (no lo atrapa el handler)', async () => {
      mocks.rpcMock.mockResolvedValue({ data: null, error: new Error('boom') })
      let erroDentroDelHandler: unknown = 'no-lanzo'
      mocks.withIdempotencyMock.mockImplementationOnce(async (_scope, _key, handler) => {
        try {
          return await handler()
        } catch (e) {
          erroDentroDelHandler = e
          throw e
        }
      })

      const res = await PATCH(req({ descripcion: 'x' }), { params })

      expect(res.status).toBe(500)
      expect((erroDentroDelHandler as Error)?.message).toBe('boom')
    })
  })
})

describe('DELETE /api/cotizaciones/[id]/items/[itemId]', () => {
  it('borra la fila y emite item_confirmed operation=delete tras el commit', async () => {
    const res = await DELETE(new Request(`http://x/api/cotizaciones/SH001/items/${ITEM_ID}`, { method: 'DELETE' }), { params })

    expect(res.status).toBe(200)
    expect(mocks.deleteEqMock).toHaveBeenCalledWith('id', ITEM_ID)
    expect(mocks.recalculateQuotationHeaderMock).toHaveBeenCalledTimes(1)
    expect(mocks.sendRealtimeBroadcastMock).toHaveBeenCalledWith([{
      topic: 'cotizacion:SH001',
      event: 'item_confirmed',
      payload: {
        cotizacion_id: 'SH001',
        item_id: ITEM_ID,
        revision: null,
        mutation_id: null,
        operation: 'delete',
        at: expect.any(String),
      },
      private: true,
    }])
  })

  it('si falla el borrado en Supabase, responde 500 y no emite el evento', async () => {
    mocks.deleteEqMock.mockResolvedValueOnce({ error: new Error('boom') })

    const res = await DELETE(new Request(`http://x/api/cotizaciones/SH001/items/${ITEM_ID}`, { method: 'DELETE' }), { params })

    expect(res.status).toBe(500)
    expect(mocks.sendRealtimeBroadcastMock).not.toHaveBeenCalled()
  })
})
