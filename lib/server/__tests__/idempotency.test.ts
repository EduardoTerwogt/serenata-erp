import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: mocks.fromMock },
}))

import { computePayloadHash, withIdempotency } from '../idempotency'

function tableMock({
  insertError = null,
  selectData = null,
  updateError = null,
}: {
  insertError?: { message: string; code?: string } | null
  selectData?: { status_code: number | null; response: unknown; payload_hash?: string | null } | null
  updateError?: { message: string } | null
}) {
  return {
    insert: vi.fn(() => Promise.resolve({ error: insertError })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: selectData })),
        })),
      })),
    })),
    update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: updateError })) })) })),
    delete: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) })),
  }
}

describe('withIdempotency', () => {
  beforeEach(() => {
    mocks.fromMock.mockReset()
  })

  it('sin key, corre el handler directo (comportamiento viejo)', async () => {
    const handler = vi.fn().mockResolvedValue({ status: 200, body: { ok: true } })
    const result = await withIdempotency('scope', null, handler)
    expect(handler).toHaveBeenCalledOnce()
    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(mocks.fromMock).not.toHaveBeenCalled()
  })

  it('primera vez con una key: corre el handler y guarda el resultado', async () => {
    const table = tableMock({ insertError: null })
    mocks.fromMock.mockReturnValue(table)
    const handler = vi.fn().mockResolvedValue({ status: 200, body: { ok: true } })

    const result = await withIdempotency('scope', 'key-1', handler)

    expect(handler).toHaveBeenCalledOnce()
    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(table.update).toHaveBeenCalledWith({ status_code: 200, response: { ok: true } })
  })

  it('firma retrocompatible: sin options, se comporta igual (payload_hash NULL)', async () => {
    const table = tableMock({ insertError: null })
    mocks.fromMock.mockReturnValue(table)
    const handler = vi.fn().mockResolvedValue({ status: 200, body: { ok: true } })

    await withIdempotency('scope', 'key-1', handler)

    expect(table.insert).toHaveBeenCalledWith({ scope: 'scope', key: 'key-1', payload_hash: null })
  })

  it('key repetida (23505): NO vuelve a correr el handler, retorna la respuesta guardada de una fila COMPLETADA', async () => {
    const table = tableMock({
      insertError: { message: 'duplicate key', code: '23505' },
      selectData: { status_code: 200, response: { ok: true, pagoId: 'pago-1' } },
    })
    mocks.fromMock.mockReturnValue(table)
    const handler = vi.fn().mockResolvedValue({ status: 200, body: { ok: true, pagoId: 'DEBERIA-NO-VERSE' } })

    const result = await withIdempotency('scope', 'key-1', handler)

    expect(handler).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 200, body: { ok: true, pagoId: 'pago-1' } })
  })

  it('1E-1 -- una fila completada reproduce su resultado SIN comparar payload_hash', async () => {
    const table = tableMock({
      insertError: { message: 'duplicate key', code: '23505' },
      selectData: { status_code: 200, response: { ok: true }, payload_hash: 'hash-original' },
    })
    mocks.fromMock.mockReturnValue(table)
    const handler = vi.fn()

    const result = await withIdempotency('scope', 'key-1', handler, { payloadHash: 'hash-distinto' })

    expect(result).toEqual({ status: 200, body: { ok: true } })
  })

  it('1E-1 -- error de INSERT que NO es 23505 se relanza, nunca se trata como duplicado', async () => {
    const table = tableMock({ insertError: { message: 'connection refused', code: '08006' } })
    mocks.fromMock.mockReturnValue(table)
    const handler = vi.fn().mockResolvedValue({ status: 200, body: { ok: true } })

    await expect(withIdempotency('scope', 'key-1', handler)).rejects.toMatchObject({ message: 'connection refused' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('1E-1 -- pendiente con payload_hash distinto: fail-closed, no espera ni devuelve el resultado ajeno', async () => {
    const table = tableMock({
      insertError: { message: 'duplicate key', code: '23505' },
      selectData: { status_code: null, response: null, payload_hash: 'hash-original' },
    })
    mocks.fromMock.mockReturnValue(table)
    const handler = vi.fn()

    await expect(
      withIdempotency('scope', 'key-1', handler, { payloadHash: 'hash-distinto' })
    ).rejects.toThrow(/Conflicto de idempotencia/)
    expect(handler).not.toHaveBeenCalled()
  })

  it('1E-1 -- pendiente sin payload_hash (legacy NULL) no compara, sigue esperando como antes', async () => {
    const table = tableMock({
      insertError: { message: 'duplicate key', code: '23505' },
      selectData: { status_code: 200, response: { ok: true }, payload_hash: null },
    })
    mocks.fromMock.mockReturnValue(table)
    const handler = vi.fn()

    const result = await withIdempotency('scope', 'key-1', handler, { payloadHash: 'hash-nuevo' })

    expect(result).toEqual({ status: 200, body: { ok: true } })
  })

  it('1E-1 -- si el UPDATE final falla, la request actual igual recibe el resultado (no relanza)', async () => {
    const table = tableMock({ insertError: null, updateError: { message: 'update falló' } })
    mocks.fromMock.mockReturnValue(table)
    const handler = vi.fn().mockResolvedValue({ status: 200, body: { ok: true } })

    const result = await withIdempotency('scope', 'key-1', handler)

    expect(result).toEqual({ status: 200, body: { ok: true } })
  })

  it('si el handler truena, libera la key para permitir un reintento real', async () => {
    const table = tableMock({ insertError: null })
    mocks.fromMock.mockReturnValue(table)
    const handler = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(withIdempotency('scope', 'key-1', handler)).rejects.toThrow('boom')
    expect(table.delete).toHaveBeenCalled()
  })
})

describe('computePayloadHash', () => {
  it('mismo payload con claves en distinto orden produce el mismo hash', () => {
    const a = computePayloadHash({ b: 2, a: 1, nested: { y: 2, x: 1 } })
    const b = computePayloadHash({ a: 1, b: 2, nested: { x: 1, y: 2 } })
    expect(a).toBe(b)
  })

  it('no reordena arrays -- un cambio de orden en un array cambia el hash', () => {
    const a = computePayloadHash({ items: [1, 2, 3] })
    const b = computePayloadHash({ items: [3, 2, 1] })
    expect(a).not.toBe(b)
  })

  it('un cambio real de contenido cambia el hash', () => {
    const a = computePayloadHash({ monto: 100 })
    const b = computePayloadHash({ monto: 200 })
    expect(a).not.toBe(b)
  })
})
