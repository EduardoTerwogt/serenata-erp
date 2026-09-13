import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: { from: mocks.fromMock },
}))

import { computePayloadHash, withIdempotency } from '../idempotency'
import { computeClientPayloadHash } from '@/lib/shared/canonicalPayload'

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

// Hallazgo de auditoría PR #29: probar la paridad DIRECTA entre el hash del
// servidor (`computePayloadHash`, Node `crypto`) y el del cliente
// (`computeClientPayloadHash`, Web Crypto) -- ambos comparten
// `canonicalizeJson`, pero solo comparar sus resultados byte a byte sobre
// varios payloads reales (anidados, arrays, Unicode) prueba que la
// paridad se sostiene en la práctica, no solo que la canonicalización en
// sí misma esté bien (ya cubierto por separado en
// `lib/shared/__tests__/canonicalPayload.test.ts`).
describe('paridad SHA-256 cliente/servidor (computePayloadHash vs computeClientPayloadHash)', () => {
  const payloads: Array<[string, unknown]> = [
    ['objeto plano', { a: 1, b: 'dos', c: true, d: null }],
    ['objeto anidado con claves en distinto orden', { z: { nested: { y: 2, x: 1 } }, a: 1 }],
    ['arrays (el orden importa, no se reordenan)', { items: [{ id: 'c' }, { id: 'a' }, { id: 'b' }] }],
    ['Unicode -- acentos, eñes y emoji', { cliente: 'Peña Ñoño', proyecto: 'Boda en México 🎉', nota: '日本語テスト' }],
    ['payload real de bulk-import (anidado + array + Unicode)', {
      items: [
        { id: 'item-1', descripcion: 'Renta de grúa Technocrane®', precio_unitario: 25000, responsable_nombre: 'José Ángel' },
        { id: 'item-2', descripcion: 'Catering — menú vegetariano', precio_unitario: 8000, responsable_nombre: null },
      ],
      reemplazar_ids: [{ id: 'item-1', revision: 2 }],
      cotizacionId: 'SH-2026-Ñ001',
    }],
    ['valores extremos -- vacío, cero, negativo, decimales', { vacio: '', cero: 0, negativo: -15.5, arr: [] }],
  ]

  it.each(payloads)('%s', async (_label, payload) => {
    const serverHash = computePayloadHash(payload)
    const clientHash = await computeClientPayloadHash(payload)
    expect(clientHash).toBe(serverHash)
    expect(serverHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

// Hallazgo de auditoría PR #29 (pruebas compuestas v13.1): dos requests con
// la MISMA (scope, key, payload_hash) -- el "original lento" y su
// "retry exacto" tras un `not_found`/`ambiguous` -- deben resultar en UNA
// SOLA ejecución del handler sin importar cuál de los dos gana la carrera
// del INSERT. Mock con estado REAL (un Map compartido, no un valor fijo)
// para que el segundo INSERT que llega vea de verdad el `23505` que dejó
// el primero, y su poll subsiguiente vea el resultado que el primero
// terminó de guardar -- a diferencia de `tableMock` (arriba), que fija la
// respuesta de antemano y no sirve para probar una carrera real.
describe('withIdempotency -- carrera real, ambos órdenes de llegada (una sola aplicación)', () => {
  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function createRaceTable() {
    const store = new Map<string, { status_code: number | null; response: unknown; payload_hash: string | null }>()
    return {
      insert: vi.fn(async ({ scope, key, payload_hash }: { scope: string; key: string; payload_hash: string | null }) => {
        const k = `${scope}:${key}`
        if (store.has(k)) return { error: { code: '23505', message: 'duplicate key' } }
        store.set(k, { status_code: null, response: null, payload_hash })
        return { error: null }
      }),
      select: vi.fn(() => ({
        eq: (_c1: string, scopeVal: string) => ({
          eq: (_c2: string, keyVal: string) => ({
            maybeSingle: async () => ({ data: store.get(`${scopeVal}:${keyVal}`) ?? null }),
          }),
        }),
      })),
      update: vi.fn((patch: { status_code: number; response: unknown }) => ({
        eq: (_c1: string, scopeVal: string) => ({
          eq: (_c2: string, keyVal: string) => {
            const row = store.get(`${scopeVal}:${keyVal}`)
            if (row) Object.assign(row, patch)
            return Promise.resolve({ error: null })
          },
        }),
      })),
      delete: vi.fn(() => ({
        eq: (_c1: string, scopeVal: string) => ({
          eq: (_c2: string, keyVal: string) => {
            store.delete(`${scopeVal}:${keyVal}`)
            return Promise.resolve({ error: null })
          },
        }),
      })),
    }
  }

  async function callConcurrente(table: ReturnType<typeof createRaceTable>, delayMs: number, handler: () => Promise<{ status: number; body: unknown }>) {
    if (delayMs > 0) await sleep(delayMs)
    return withIdempotency('scope-carrera', 'op-misma-identidad', handler, { payloadHash: 'hash-compartido' })
  }

  it('orden A-primero: A gana el INSERT, B lo ve duplicado y espera -- una sola aplicación', async () => {
    const table = createRaceTable()
    mocks.fromMock.mockReturnValue(table)
    let ejecuciones = 0
    const handler = vi.fn(async () => {
      ejecuciones += 1
      return { status: 200, body: { ok: true, ejecucion: ejecuciones } }
    })

    const [resultA, resultB] = await Promise.all([
      callConcurrente(table, 0, handler),
      callConcurrente(table, 5, handler),
    ])

    expect(handler).toHaveBeenCalledTimes(1)
    expect(resultA).toEqual({ status: 200, body: { ok: true, ejecucion: 1 } })
    expect(resultB).toEqual(resultA)
  })

  it('orden B-primero (mismo escenario, orden de llegada invertido): sigue siendo una sola aplicación', async () => {
    const table = createRaceTable()
    mocks.fromMock.mockReturnValue(table)
    let ejecuciones = 0
    const handler = vi.fn(async () => {
      ejecuciones += 1
      return { status: 200, body: { ok: true, ejecucion: ejecuciones } }
    })

    // Mismo escenario que el test anterior, con los delays invertidos --
    // ahora es la llamada "B" la que gana el INSERT. El resultado debe ser
    // simétrico: sigue habiendo una sola ejecución y ambas llamadas ven el
    // mismo resultado, sin importar cuál physically llegó primero.
    const [resultA, resultB] = await Promise.all([
      callConcurrente(table, 5, handler),
      callConcurrente(table, 0, handler),
    ])

    expect(handler).toHaveBeenCalledTimes(1)
    expect(resultA).toEqual(resultB)
    expect(resultA).toEqual({ status: 200, body: { ok: true, ejecucion: 1 } })
  })
})
