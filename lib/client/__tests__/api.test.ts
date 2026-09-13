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

  it('getArrayBuffer también dispara el manejo compartido de 401', async () => {
    mockFetchOnce(401, { error: 'Sesión invalidada' })
    const { getArrayBuffer } = await import('../api')

    await expect(getArrayBuffer('/api/cotizaciones/1/pdf', 'fallback')).rejects.toThrow()

    expect(mocks.signOutMock).toHaveBeenCalledWith({ redirect: false })
  })
})
