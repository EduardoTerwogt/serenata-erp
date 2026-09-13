import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * EF-2 1D-3: mismo motivo que clientes-route.test.ts -- se retiró el
 * CacheManager en memoria; dos GETs sucesivos deben consultar Postgres
 * las dos veces.
 */

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('@/lib/api-auth', () => ({ requireSection: vi.fn(async () => ({ response: null })) }))
vi.mock('@/lib/integrations/sheets/trigger', () => ({ triggerSheetsSync: vi.fn() }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { from: mocks.fromMock } }))

import { GET, POST } from '../productos/route'

function chainableSelect(data: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data, error: null }),
  }
  return chain
}

describe('GET /api/productos', () => {
  beforeEach(() => {
    mocks.fromMock.mockReset()
  })

  it('dos GETs sucesivos con el mismo query consultan Postgres las dos veces (sin caché)', async () => {
    mocks.fromMock.mockReturnValue(chainableSelect([{ id: '1', descripcion: 'Audio', precio_unitario: 1000 }]))

    const r1 = await GET(new Request('http://localhost/api/productos?q=audio'))
    const r2 = await GET(new Request('http://localhost/api/productos?q=audio'))

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(mocks.fromMock).toHaveBeenCalledTimes(2)
  })

  it('un POST no deja ningún estado que sirva una respuesta vieja al siguiente GET', async () => {
    mocks.fromMock.mockReturnValue(chainableSelect([{ id: '1', descripcion: 'Audio', precio_unitario: 1000 }]))
    await GET(new Request('http://localhost/api/productos'))

    mocks.fromMock.mockClear()
    mocks.fromMock.mockReturnValue(chainableSelect({ id: 'new-1', descripcion: 'Nuevo', precio_unitario: 500 }))
    await POST(new Request('http://localhost/api/productos', {
      method: 'POST',
      body: JSON.stringify({ descripcion: 'Nuevo', precio_unitario: 500 }),
    }))

    mocks.fromMock.mockClear()
    mocks.fromMock.mockReturnValue(chainableSelect([
      { id: '1', descripcion: 'Audio', precio_unitario: 1000 },
      { id: 'new-1', descripcion: 'Nuevo', precio_unitario: 500 },
    ]))
    const response = await GET(new Request('http://localhost/api/productos'))

    expect(mocks.fromMock).toHaveBeenCalled()
    expect(response.status).toBe(200)
  })
})
