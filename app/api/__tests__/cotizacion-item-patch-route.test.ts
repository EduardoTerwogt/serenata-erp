import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  findOrCreateProveedorByNombreMock: vi.fn(),
  recalculateQuotationHeaderMock: vi.fn(),
  runQuotationNonCriticalAutosavesMock: vi.fn(async () => undefined),
  triggerSheetsSyncMock: vi.fn(),
  rpcMock: vi.fn(),
  afterMock: vi.fn(),
}))

vi.mock('next/server', () => ({ after: mocks.afterMock }))
vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({ findOrCreateProveedorByNombre: mocks.findOrCreateProveedorByNombreMock }))
vi.mock('@/lib/server/quotations/persistence', () => ({
  recalculateQuotationHeader: mocks.recalculateQuotationHeaderMock,
  runQuotationNonCriticalAutosaves: mocks.runQuotationNonCriticalAutosavesMock,
}))
vi.mock('@/lib/integrations/sheets/trigger', () => ({ triggerSheetsSync: mocks.triggerSheetsSyncMock }))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { PATCH } from '../cotizaciones/[id]/items/[itemId]/route'

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
})
