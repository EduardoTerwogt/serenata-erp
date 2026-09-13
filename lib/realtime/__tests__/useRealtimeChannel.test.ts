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
  /**
   * Modela el registro interno del `RealtimeClient` real de Supabase:
   * `.channel(topic)` reutiliza el objeto existente para ese topic hasta que
   * `removeChannel()` termina de resolver -- si el mock siempre devolviera un
   * objeto nuevo en cada llamada, ningún test podría distinguir "convergió a
   * un solo canal" de "quedaron dos canales unidos en paralelo", que es
   * justo el bug que el remount debe descartar.
   */
  let channelsByTopic: Map<string, FakeChannel>
  /**
   * `useRealtimeChannel.ts` coordina remounts vía un `pendingRemovals`
   * módulo-scoped (no hay estado de React compartido entre instancias
   * separadas del hook) -- ese mapa persiste entre tests dentro del mismo
   * archivo. Un topic único por test evita que una entrada que quede
   * pendiente en un test (ej. un mock de `removeChannel` nunca resuelto a
   * propósito) contamine el `connect()` de otro.
   */
  let currentTopic: string

  function baseOptions(overrides: Partial<UseRealtimeChannelOptions> = {}): UseRealtimeChannelOptions {
    return {
      topic: currentTopic,
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
    channelsByTopic = new Map()
    currentTopic = `cotizacion:TEST-${Math.random().toString(36).slice(2, 10)}`
    // Modela RealtimeClient.removeChannel() real: solo hace `teardown()`
    // (baja del registro) cuando `unsubscribe()` resuelve 'ok' -- 'timed
    // out'/'error' dejan el canal registrado (@supabase/realtime-js
    // RealtimeClient.js). El default de cada test es el camino feliz;
    // los tests de 'error'/rechazo sobrescriben esto explícitamente.
    mocks.removeChannelMock.mockReset().mockImplementation((channel: FakeChannel) =>
      Promise.resolve('ok').then((status) => {
        if (status === 'ok') {
          channelsByTopic.forEach((registered, topic) => {
            if (registered === channel) channelsByTopic.delete(topic)
          })
        }
        return status
      })
    )
    mocks.authorizeRealtimeMock.mockReset().mockResolvedValue(600)
    cancelRefreshMock = vi.fn()
    mocks.scheduleTokenRefreshMock.mockReset().mockReturnValue(cancelRefreshMock)
    mocks.createPrivateChannelMock.mockReset().mockImplementation((topic: string) => {
      const existing = channelsByTopic.get(topic)
      if (existing) return existing
      const channel = makeFakeChannel(createdChannels.length)
      createdChannels.push(channel)
      channelsByTopic.set(topic, channel)
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
      (channel: FakeChannel) => new Promise<string>((resolve) => {
        resolveRemove = () => {
          channelsByTopic.forEach((registered, topic) => {
            if (registered === channel) channelsByTopic.delete(topic)
          })
          resolve('ok')
        }
      })
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
    expect(channelsByTopic.get(options.topic!)).toBe(first)

    // El cleanup de desmontaje es fire-and-forget (`void removeChannel(...)`,
    // no `await`) -- el remount ocurre en el mismo tick, antes de que esa
    // promesa resuelva. Si `connect()` no espera una remoción pendiente del
    // mismo topic, el registro del cliente real reutilizaría el objeto de
    // canal todavía unido en vez de crear uno nuevo.
    unmount()
    expect(mocks.removeChannelMock).toHaveBeenCalledWith(first)

    const second = renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
      initialProps: options,
    })
    await flush()

    // Aserción dura: al final, para este topic queda exactamente un canal
    // activo, y es uno creado DESPUÉS de que el anterior terminó de
    // removerse -- no el mismo objeto reutilizado a medio remover. Si esto
    // falla, 1A-1 queda bloqueado (ver plan): no se relaja esta aserción ni
    // se mergea con el test en rojo.
    const activeForTopic = channelsByTopic.get(options.topic!)
    expect(activeForTopic).toBeDefined()
    expect(activeForTopic).not.toBe(first)
    expect(createdChannels).toHaveLength(2)
    expect(mocks.createPrivateChannelMock).toHaveBeenCalledTimes(2)

    second.unmount()
  })

  it('removeChannel() resuelve "error": no libera el topic hasta reintentar y confirmar "ok"', async () => {
    const options = baseOptions()
    const { unmount } = renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
      initialProps: options,
    })
    await flush()
    const first = createdChannels[0]

    // Primer intento: el cliente real dejaría el canal registrado (no hace
    // `teardown()` salvo con 'ok') -- el mock por defecto de este archivo
    // solo limpia channelsByTopic cuando resuelve 'ok', así que un 'error'
    // explícito reproduce eso sin tocar el registro.
    mocks.removeChannelMock.mockImplementationOnce(() => Promise.resolve('error'))

    unmount()
    await flush()

    // Todavía registrado -- un 'error' nunca debe tratarse como "ya se fue".
    expect(channelsByTopic.get(options.topic!)).toBe(first)

    // Backoff del primer reintento (500ms) -- la segunda llamada usa el
    // mock por defecto, que sí resuelve 'ok'.
    await flush(500)

    expect(channelsByTopic.get(options.topic!)).toBeUndefined()

    // Recién ahora un remount debe obtener un canal nuevo, nunca `first`.
    const second = renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
      initialProps: options,
    })
    await flush()

    const activeForTopic = channelsByTopic.get(options.topic!)
    expect(activeForTopic).toBeDefined()
    expect(activeForTopic).not.toBe(first)

    second.unmount()
  })

  it('removeChannel() rechaza la promesa: no produce un rejection sin manejar ni bloquea el siguiente mount', async () => {
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason)
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      const options = baseOptions()
      const { unmount } = renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
        initialProps: options,
      })
      await flush()
      const first = createdChannels[0]

      mocks.removeChannelMock.mockImplementationOnce(() => Promise.reject(new Error('network lost')))

      unmount()
      await flush()

      // El rechazo se atrapa y se trata como 'error' -- ni desbloquea el
      // topic de inmediato ni escapa como una promesa sin manejar.
      expect(channelsByTopic.get(options.topic!)).toBe(first)

      await flush(500)
      expect(channelsByTopic.get(options.topic!)).toBeUndefined()

      const second = renderHook((opts: UseRealtimeChannelOptions) => useRealtimeChannel(opts), {
        initialProps: options,
      })
      await flush()
      expect(channelsByTopic.get(options.topic!)).not.toBe(first)

      second.unmount()
      await flush(2000) // agota cualquier reintento pendiente del segundo unmount también
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }

    expect(unhandledRejections).toHaveLength(0)
  })
})
