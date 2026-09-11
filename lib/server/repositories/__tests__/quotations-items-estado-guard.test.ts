import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { upsertItems, deleteItemCotizacion, EstadoCotizacionInvalidoError } from '../quotations'

beforeEach(() => {
  mocks.rpcMock.mockReset()
})

// Fase 8.7.1: `upsert_items_cotizacion` y `delete_item_cotizacion` ahora
// rechazan si la cotización dueña ya no está en BORRADOR/EMITIDA (guard bajo
// FOR SHARE, ver db/migrations/20260911_item_cotizacion_estado_guard.sql).
// Estos tests cubren solo el mapeo JS de esa respuesta -- el guard
// transaccional en sí se prueba contra Postgres real en los tests live.
describe('upsertItems', () => {
  it('devuelve las filas cuando la RPC responde {items: [...]}', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { items: [{ id: 'a' }] }, error: null })

    const result = await upsertItems([{ id: 'a', cotizacion_id: 'SH001' }])

    expect(result).toEqual([{ id: 'a' }])
  })

  it('lanza EstadoCotizacionInvalidoError cuando la RPC rechaza por estado', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { estado_invalido: true, estado_actual: 'APROBADA' }, error: null })

    await expect(upsertItems([{ id: 'a', cotizacion_id: 'SH001' }]))
      .rejects.toBeInstanceOf(EstadoCotizacionInvalidoError)
  })

  it('el error trae el estado actual para que la ruta lo devuelva en el body', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { estado_invalido: true, estado_actual: 'CANCELADA' }, error: null })

    await expect(upsertItems([{ id: 'a', cotizacion_id: 'SH001' }]))
      .rejects.toMatchObject({ estadoActual: 'CANCELADA' })
  })
})

describe('deleteItemCotizacion', () => {
  it('resuelve sin lanzar cuando la RPC borra la fila', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { deleted: true }, error: null })

    await expect(deleteItemCotizacion('SH001', 'item-1')).resolves.toBeUndefined()
  })

  it('resuelve sin lanzar cuando la fila ya no existe (mismo comportamiento que antes)', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { deleted: false }, error: null })

    await expect(deleteItemCotizacion('SH001', 'item-1')).resolves.toBeUndefined()
  })

  it('lanza EstadoCotizacionInvalidoError cuando la RPC rechaza por estado', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { estado_invalido: true, estado_actual: 'APROBADA' }, error: null })

    await expect(deleteItemCotizacion('SH001', 'item-1'))
      .rejects.toBeInstanceOf(EstadoCotizacionInvalidoError)
  })
})
