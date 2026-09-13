// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 1A-1 (EF-2): `useRealtimeChannel.ts` tiene toda la lógica de reconexión
 * con backoff, cancelación de la cadena de refresco de token y cleanup --
 * los 3 fixes de lifecycle que el propio archivo documenta se confirmaron
 * "en vivo" en CI (2026-09-10), nunca con un test dedicado. Este archivo
 * cubre esa resiliencia de forma determinista, sin red real.
 */

const mocks = vi.hoisted(() => ({
  removeChannelMock: vi.fn(),
  createPrivateChannelMock: vi.fn(),
  authorizeRealtimeMock: vi.fn(),
  scheduleTokenRefreshMock: vi.fn(),
}))

vi.mock('@/lib/supabase-browser', () => ({
  supabaseBrowser: {
    removeChannel: mocks.removeChannelMock,
  },
}))

vi.mock('@/lib/realtime/authorize', () => ({
  createPrivateChannel: mocks.createPrivateChannelMock,
  authorizeRealtime: mocks.authorizeRealtimeMock,
  scheduleTokenRefresh: mocks.scheduleTokenRefreshMock,
}))

import { useRealtimeChannel, type UseRealtimeChannelOptions } from '../useRealtimeChannel'

interface FakeChannel {
  id: number
  statusCallback: ((status: string) => void | Promise<void>) | null
  subscribe: ReturnType<typeof vi.fn>
  untrack: ReturnType<typeof vi.fn>
}

function makeFakeChannel(id: number): FakeChannel {
  const channel: FakeChannel = {
    id,
    statusCallback: null,
    subscribe: vi.fn((cb: (status: string) => void | Promise<void>) => {
      channel.statusCallback = cb
      return channel
    }),
    untrack: vi.fn().mockResolvedValue(undefined),
  }
  return channel
}

/** Deja correr timers + microtasks pendientes sin control real de reloj. */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useRealtimeChannel', () => {
  let createdChannels: FakeChannel[]
  let cancelRefreshMock: ReturnType<typeof vi.fn>

  function baseOptions(overrides: Partial<UseRealtimeChannelOptions> = {}): UseRealtimeChannelOptions {
    return {
      topic: 'cotizacion:SH001',
      enabled: true,
      presenceKeyPrefix: 'user-1',
      onChannelCreated: vi.fn(),
      onSubscribed: vi.fn(),
      onDisconnected: vi.fn(),
      onSessionEnd: vi.fn(),
      ...overrides,
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    createdChannels = []
    mocks.removeChannelMock.mockReset().mockResolvedValue(undefined)
    mocks.authorizeRealtimeMock.mockReset().mockResolvedValue(600)
    cancelRefreshMock = vi.fn()
    mocks.scheduleTokenRefreshMock.mockReset().mockReturnValue(cancelRefreshMock)
    mocks.createPrivateChannelMock.mockReset().mockImplementation(() => {
      const channel = makeFakeChannel(createdChannels.length)
      createdChannels.push(channel)
      return channel
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('backoff exponencial: 1s, 2s, 4s... con tope de 10s', async () => {
    const { unmount } = renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
      initialProps: baseOptions(),
    })
    await flush()
    expect(createdChannels).toHaveLength(1)

    const delays: number[] = [1000, 2000, 4000, 8000, 10000, 10000]
    for (let i = 0; i < delays.length; i++) {
      const current = createdChannels[i]
      await act(async () => {
        await current.statusCallback?.('CHANNEL_ERROR')
      })
      // Justo antes del delay esperado, todavía no debe reconectar.
      await flush(delays[i] - 1)
      expect(createdChannels).toHaveLength(i + 1)
      // Al cumplirse el delay, reconecta -- se crea el siguiente canal.
      await flush(1)
      expect(mocks.removeChannelMock).toHaveBeenCalledWith(current)
      expect(createdChannels).toHaveLength(i + 2)
    }

    unmount()
  })

  it('cancela la cadena de refresco de token anterior antes de pedir una nueva en cada reconexión', async () => {
    const firstCancel = vi.fn()
    const secondCancel = vi.fn()
    mocks.scheduleTokenRefreshMock
      .mockReturnValueOnce(firstCancel)
      .mockReturnValueOnce(secondCancel)

    renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
      initialProps: baseOptions(),
    })
    await flush()
    expect(mocks.scheduleTokenRefreshMock).toHaveBeenCalledTimes(1)
    expect(firstCancel).not.toHaveBeenCalled()

    const first = createdChannels[0]
    await act(async () => {
      await first.statusCallback?.('CHANNEL_ERROR')
    })
    await flush(1000)

    // La reconexión canceló la cadena de refresco del canal anterior antes
    // de pedir (y obtener) una nueva.
    expect(firstCancel).toHaveBeenCalledTimes(1)
    expect(mocks.scheduleTokenRefreshMock).toHaveBeenCalledTimes(2)
    expect(secondCancel).not.toHaveBeenCalled()
  })

  it('connect() espera removeChannel() del canal anterior antes de reintentar', async () => {
    let resolveRemove: (() => void) | null = null
    mocks.removeChannelMock.mockImplementation(
      () => new Promise<void>((resolve) => { resolveRemove = resolve })
    )

    renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
      initialProps: baseOptions(),
    })
    await flush()
    const first = createdChannels[0]

    await act(async () => {
      await first.statusCallback?.('CHANNEL_ERROR')
    })
    await flush(1000)

    // removeChannel fue llamado pero todavía no resuelve -- connect() no
    // debe haber creado un segundo canal todavía (la regresión real:
    // "cannot add presence callbacks after joining a channel" ocurría
    // cuando se pedía un canal para el mismo topic antes de que el
    // anterior terminara de removerse).
    expect(mocks.removeChannelMock).toHaveBeenCalledWith(first)
    expect(createdChannels).toHaveLength(1)

    await act(async () => {
      resolveRemove?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createdChannels).toHaveLength(2)
  })

  it('cleanup completo al desmontar: cancela timers, refresco de token, untrack, removeChannel y onSessionEnd', async () => {
    const onSessionEnd = vi.fn()
    const { unmount } = renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
      initialProps: baseOptions({ onSessionEnd }),
    })
    await flush()
    const channel = createdChannels[0]
    expect(onSessionEnd).not.toHaveBeenCalled()

    unmount()

    expect(cancelRefreshMock).toHaveBeenCalledTimes(1)
    expect(onSessionEnd).toHaveBeenCalledTimes(1)
    expect(channel.untrack).toHaveBeenCalledTimes(1)
    expect(mocks.removeChannelMock).toHaveBeenCalledWith(channel)
  })

  it('cleanup completo al cambiar topic/enabled: no queda un reconnect pendiente del canal viejo', async () => {
    const { rerender } = renderHook(
      (opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts),
      { initialProps: baseOptions() }
    )
    await flush()
    const first = createdChannels[0]

    // Provoca una reconexión en vuelo (timer pendiente) y cambia `enabled`
    // antes de que dispare -- el timer viejo no debe crear un canal extra.
    await act(async () => {
      await first.statusCallback?.('CHANNEL_ERROR')
    })
    rerender(baseOptions({ enabled: false }))
    await flush(5000)

    expect(createdChannels).toHaveLength(1)
    expect(mocks.removeChannelMock).toHaveBeenCalledWith(first)
  })

  it('suscripción única: un re-render con las mismas props no crea un segundo canal', async () => {
    const options = baseOptions()
    const { rerender } = renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
      initialProps: options,
    })
    await flush()
    expect(mocks.createPrivateChannelMock).toHaveBeenCalledTimes(1)

    rerender(options)
    await flush()

    expect(mocks.createPrivateChannelMock).toHaveBeenCalledTimes(1)
  })

  it('remount: converge a un solo canal activo para el mismo topic', async () => {
    const options = baseOptions()
    const { unmount } = renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
      initialProps: options,
    })
    await flush()
    const first = createdChannels[0]
    expect(mocks.removeChannelMock).not.toHaveBeenCalled()

    unmount()
    expect(mocks.removeChannelMock).toHaveBeenCalledWith(first)

    const second = renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
      initialProps: options,
    })
    await flush()

    // Aserción dura: al final, para este topic queda exactamente un canal
    // activo -- el del remount. Si esto falla, 1A-1 queda bloqueado (ver
    // plan): no se relaja esta aserción ni se mergea con el test en rojo.
    expect(createdChannels).toHaveLength(2)
    expect(mocks.createPrivateChannelMock).toHaveBeenCalledTimes(2)

    second.unmount()
  })
})
