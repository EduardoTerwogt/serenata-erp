import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setAuthMock: vi.fn(),
  channelMock: vi.fn(),
}))

vi.mock('@/lib/supabase-browser', () => ({
  supabaseBrowser: {
    realtime: { setAuth: mocks.setAuthMock },
    channel: mocks.channelMock,
  },
}))

import { authorizeRealtime, createPrivateChannel, fetchRealtimeToken, scheduleTokenRefresh } from '../authorize'

describe('fetchRealtimeToken', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('lanza cuando la respuesta no es ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch
    await expect(fetchRealtimeToken()).rejects.toThrow('401')
  })

  it('devuelve el token y expires_in del endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt-123', expires_in: 600 }),
    }) as unknown as typeof fetch

    await expect(fetchRealtimeToken()).resolves.toEqual({ token: 'jwt-123', expires_in: 600 })
  })
})

describe('authorizeRealtime', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mocks.setAuthMock.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('llama supabaseBrowser.realtime.setAuth con el token obtenido y devuelve expires_in', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt-abc', expires_in: 600 }),
    }) as unknown as typeof fetch

    const expiresIn = await authorizeRealtime()

    expect(mocks.setAuthMock).toHaveBeenCalledWith('jwt-abc')
    expect(expiresIn).toBe(600)
  })
})

describe('createPrivateChannel', () => {
  it('crea el canal con config.private = true, preservando el resto de la config', () => {
    mocks.channelMock.mockReturnValue('canal-fake')

    const result = createPrivateChannel('cotizacion:SH001', { presence: { key: 'x' } })

    expect(mocks.channelMock).toHaveBeenCalledWith('cotizacion:SH001', {
      config: { presence: { key: 'x' }, private: true },
    })
    expect(result).toBe('canal-fake')
  })
})

describe('scheduleTokenRefresh', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.setAuthMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    global.fetch = originalFetch
  })

  it('refresca el token al 60% del TTL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'refreshed', expires_in: 600 }),
    }) as unknown as typeof fetch

    const cancel = scheduleTokenRefresh(600)

    await vi.advanceTimersByTimeAsync(600 * 0.6 * 1000)

    expect(mocks.setAuthMock).toHaveBeenCalledWith('refreshed')
    cancel()
  })

  it('reintenta a los 15s si el refresh falla, y no reintenta más tras cancelar', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('red caída')) as unknown as typeof fetch
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    // TTL=100 -> primer intento a los 60s (100*0.6), luego reintentos cada 15s si falla.
    const cancel = scheduleTokenRefresh(100)

    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(15 * 1000)
    expect(global.fetch).toHaveBeenCalledTimes(2)

    cancel()
    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(global.fetch).toHaveBeenCalledTimes(2)

    consoleErrorSpy.mockRestore()
  })
})
