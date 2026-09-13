import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * EF-2 1D-3: se retiró el CacheManager en memoria de este endpoint (no
 * persistía entre instancias de Vercel de cualquier forma). Reemplaza a
 * cache-invalidation.test.ts -- confirma que dos GETs sucesivos consultan
 * Postgres las dos veces, sin ninguna capa de caché intermedia.
 */

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('@/lib/api-auth', () => ({ requireSection: vi.fn(async () => ({ response: null })) }))
vi.mock('@/lib/integrations/sheets/trigger', () => ({ triggerSheetsSync: vi.fn() }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { from: mocks.fromMock } }))

import { GET, POST } from '../clientes/route'

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

describe('GET /api/clientes', () => {
  beforeEach(() => {
    mocks.fromMock.mockReset()
  })

  it('dos GETs sucesivos consultan Postgres las dos veces (sin caché)', async () => {
    mocks.fromMock.mockReturnValue(chainableSelect([{ id: '1', nombre: 'ACME', proyectos: [] }]))

    const r1 = await GET(new Request('http://localhost/api/clientes'))
    const r2 = await GET(new Request('http://localhost/api/clientes'))

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(mocks.fromMock).toHaveBeenCalledTimes(2)
  })

  it('un POST no deja ningún estado que sirva una respuesta vieja al siguiente GET', async () => {
    mocks.fromMock.mockReturnValue(chainableSelect([{ id: '1', nombre: 'ACME', proyectos: [] }]))
    await GET(new Request('http://localhost/api/clientes'))

    mocks.fromMock.mockClear()
    mocks.fromMock.mockReturnValue(chainableSelect({ id: 'new-1', nombre: 'Nuevo', proyectos: [] }))
    await POST(new Request('http://localhost/api/clientes', { method: 'POST', body: JSON.stringify({ nombre: 'Nuevo' }) }))

    mocks.fromMock.mockClear()
    mocks.fromMock.mockReturnValue(chainableSelect([{ id: '1', nombre: 'ACME', proyectos: [] }, { id: 'new-1', nombre: 'Nuevo', proyectos: [] }]))
    const response = await GET(new Request('http://localhost/api/clientes'))

    expect(mocks.fromMock).toHaveBeenCalled()
    expect(response.status).toBe(200)
  })
})
