import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: mocks.fromMock },
}))

import { withIdempotency } from '../idempotency'

function tableMock({
  insertError = null,
  selectData = null,
}: {
  insertError?: { message: string } | null
  selectData?: { status_code: number; response: unknown } | null
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
    update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) })),
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

  it('key repetida: NO vuelve a correr el handler, retorna la respuesta guardada', async () => {
    const table = tableMock({
      insertError: { message: 'duplicate key' },
      selectData: { status_code: 200, response: { ok: true, pagoId: 'pago-1' } },
    })
    mocks.fromMock.mockReturnValue(table)
    const handler = vi.fn().mockResolvedValue({ status: 200, body: { ok: true, pagoId: 'DEBERIA-NO-VERSE' } })

    const result = await withIdempotency('scope', 'key-1', handler)

    expect(handler).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 200, body: { ok: true, pagoId: 'pago-1' } })
  })

  it('si el handler truena, libera la key para permitir un reintento real', async () => {
    const table = tableMock({ insertError: null })
    mocks.fromMock.mockReturnValue(table)
    const handler = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(withIdempotency('scope', 'key-1', handler)).rejects.toThrow('boom')
    expect(table.delete).toHaveBeenCalled()
  })
})
