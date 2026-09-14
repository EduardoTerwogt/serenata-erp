// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * EF-2 1B-2b: un 401 de staff (sesión invalidada, o nunca autenticado)
 * dispara signOut() + redirect a /login desde un solo lugar
 * (handleUnauthorizedResponse, interno a este archivo). El Portal de
 * proveedores tiene su propia sesión -- sus rutas quedan excluidas.
 */

const mocks = vi.hoisted(() => ({ signOutMock: vi.fn(async () => undefined) }))
vi.mock('next-auth/react', () => ({ signOut: mocks.signOutMock }))

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch
}

describe('lib/client/api.ts -- manejo compartido de 401', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.signOutMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('un 401 en una ruta de staff dispara signOut({redirect: false})', async () => {
    mockFetchOnce(401, { error: 'Sesión invalidada' })
    const { getJson } = await import('../api')

    await expect(getJson('/api/cotizaciones', 'fallback', { method: 'POST' })).rejects.toThrow()

    expect(mocks.signOutMock).toHaveBeenCalledWith({ redirect: false })
  })

  it('un 401 en /api/portal/* NO dispara signOut() -- el Portal maneja su propia sesión', async () => {
    mockFetchOnce(401, { error: 'No autenticado' })
    const { getJson } = await import('../api')

    await expect(getJson('/api/portal/me', 'fallback')).rejects.toThrow()

    expect(mocks.signOutMock).not.toHaveBeenCalled()
  })

  it('un 401 en /api/auth/* NO dispara signOut() -- son las propias rutas de NextAuth', async () => {
    mockFetchOnce(401, { error: 'x' })
    const { getJson } = await import('../api')

    await expect(getJson('/api/auth/session', 'fallback')).rejects.toThrow()

    expect(mocks.signOutMock).not.toHaveBeenCalled()
  })

  it('dedupe: dos 401 concurrentes en rutas de staff disparan un solo signOut()', async () => {
    mockFetchOnce(401, { error: 'Sesión invalidada' })
    const { getJson } = await import('../api')

    await Promise.allSettled([
      getJson('/api/cotizaciones/a', 'fallback', { method: 'POST' }),
      getJson('/api/cotizaciones/b', 'fallback', { method: 'POST' }),
    ])

    expect(mocks.signOutMock).toHaveBeenCalledTimes(1)
  })

  it('un 503 (servicio no disponible, error transitorio) NUNCA dispara signOut()', async () => {
    mockFetchOnce(503, { error: 'Servicio no disponible, intenta de nuevo', requestId: 'req-1' })
    const { getJson } = await import('../api')

    await expect(getJson('/api/cotizaciones', 'fallback', { method: 'POST' })).rejects.toThrow()

    expect(mocks.signOutMock).not.toHaveBeenCalled()
  })

  it('dos GET concurrentes al mismo URL sin AbortSignal comparten un único fetch (dedupe normal)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const { getJson } = await import('../api')

    await Promise.all([
      getJson('/api/x', 'fallback'),
      getJson('/api/x', 'fallback'),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // EF-3 3B-2: useCuentasCobrar pasa su propio AbortSignal a cada GET para
  // poder cancelar una búsqueda en vuelo -- si ese GET compartiera in-flight
  // (por URL) con otro caller sin relación, abortar el primero abortaría
  // también al segundo aunque su propio signal jamás se haya abortado. Un
  // GET con `signal` queda fuera de la dedupe precisamente para evitar eso.
  it('un GET con su propio AbortSignal NO comparte in-flight con otro GET al mismo URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const { getJson } = await import('../api')

    const controller = new AbortController()
    await Promise.all([
      getJson('/api/x', 'fallback', { signal: controller.signal }),
      getJson('/api/x', 'fallback'),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('getArrayBuffer también dispara el manejo compartido de 401', async () => {
    mockFetchOnce(401, { error: 'Sesión invalidada' })
    const { getArrayBuffer } = await import('../api')

    await expect(getArrayBuffer('/api/cotizaciones/1/pdf', 'fallback')).rejects.toThrow()

    expect(mocks.signOutMock).toHaveBeenCalledWith({ redirect: false })
  })
})
