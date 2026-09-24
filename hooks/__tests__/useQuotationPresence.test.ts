// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * docs/decisions/016: `useQuotationPresence` ya no llama `channel.track()` ni
 * tiene heartbeat -- declara su awareness vía `publishPresence` y el publicador
 * de `useRealtimeChannel` decide cuándo enviar (agrupado, deduplicado por
 * `JSON.stringify`, dentro del presupuesto del servidor). Estos tests fijan el
 * contrato del lado de este hook: qué declara y que re-declarar el mismo
 * estado produce un payload IDÉNTICO (si no, el deduplicado no serviría y cada
 * tecla volvería a gastar presupuesto).
 */

const mocks = vi.hoisted(() => ({
  publishPresence: vi.fn(),
  lastOptions: null as null | { topic: string | null | undefined; onSessionEnd: () => void },
}))

vi.mock('@/lib/realtime/useRealtimeChannel', () => ({
  useRealtimeChannel: (options: { topic: string | null | undefined; onSessionEnd: () => void }) => {
    mocks.lastOptions = options
    return { channelRef: { current: null }, publishPresence: mocks.publishPresence }
  },
}))

import { useQuotationPresence } from '../useQuotationPresence'

const user = { id: 'user-a', email: 'a@serenata.mx', name: 'Usuario A' }

function lastPayload() {
  return mocks.publishPresence.mock.calls[mocks.publishPresence.mock.calls.length - 1][0] as Record<string, unknown>
}

describe('useQuotationPresence -- awareness declarada', () => {
  beforeEach(() => {
    mocks.publishPresence.mockReset()
    mocks.lastOptions = null
  })

  it('declara el estado inicial al montar (lo que se publica al unirse al canal)', () => {
    renderHook(() => useQuotationPresence({ cotizacionId: 'SH001', enabled: true, currentUser: user }))
    expect(mocks.publishPresence).toHaveBeenCalledTimes(1)
    expect(lastPayload()).toMatchObject({ user_id: 'user-a', active_section: null, entity_id: null, field: null })
  })

  it('deshabilitado no declara nada', () => {
    renderHook(() => useQuotationPresence({ cotizacionId: 'SH001', enabled: false, currentUser: user }))
    expect(mocks.publishPresence).not.toHaveBeenCalled()
  })

  it('re-declarar la misma celda (cada tecla) produce un payload idéntico, incluido online_at', () => {
    const { result } = renderHook(() => useQuotationPresence({ cotizacionId: 'SH001', enabled: true, currentUser: user }))
    act(() => {
      result.current.setActiveSection('partidas')
      result.current.lockItemCell('row-1', 'descripcion')
    })
    const first = lastPayload()
    expect(first).toMatchObject({ active_section: 'partidas', entity_id: 'row-1', field: 'descripcion' })

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 60_000)
    act(() => {
      result.current.setActiveSection('partidas')
      result.current.lockItemCell('row-1', 'descripcion')
    })
    vi.useRealTimers()
    expect(JSON.stringify(lastPayload())).toBe(JSON.stringify(first))
  })

  it('salir de la sección limpia sección y celda', () => {
    const { result } = renderHook(() => useQuotationPresence({ cotizacionId: 'SH001', enabled: true, currentUser: user }))
    act(() => {
      result.current.setActiveSection('partidas')
      result.current.lockItemCell('row-1', 'cantidad')
      result.current.releaseSection('partidas')
    })
    expect(lastPayload()).toMatchObject({ active_section: null, entity_id: null, field: null })
  })

  it('otra cotización: vuelve a declarar su estado para el canal nuevo', () => {
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useQuotationPresence({ cotizacionId: id, enabled: true, currentUser: user }),
      { initialProps: { id: 'SH001' } }
    )
    expect(mocks.publishPresence).toHaveBeenCalledTimes(1)
    rerender({ id: 'SH002' })
    expect(mocks.lastOptions?.topic).toBe('cotizacion:SH002')
    expect(mocks.publishPresence).toHaveBeenCalledTimes(2)
  })
})
