import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * EF-2 1D-1: no existía test de ruta para emitir/route.ts -- nuevo,
 * siguiendo la convención de app/api/__tests__/. Cubre el camino feliz
 * (agenda y ejecuta el broadcast general_confirmed vía after()) y los
 * casos de error ya existentes en la ruta (sin tocarlos).
 */

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCotizacionByIdMock: vi.fn(),
  rpcMock: vi.fn(),
  afterMock: vi.fn(),
  sendRealtimeBroadcastMock: vi.fn(async () => undefined),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({ getCotizacionById: mocks.getCotizacionByIdMock }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))
vi.mock('next/server', () => ({ after: mocks.afterMock }))
vi.mock('@/lib/server/realtime/broadcast', () => ({ sendRealtimeBroadcast: mocks.sendRealtimeBroadcastMock }))

import { POST } from '../cotizaciones/[id]/emitir/route'

const params = Promise.resolve({ id: 'SH001' })
const req = () => new Request('http://x/api/cotizaciones/SH001/emitir', { method: 'POST' })

const cotizacionEmitida = { id: 'SH001', cliente: 'ACME', proyecto: 'Spot', estado: 'EMITIDA', items: [] }

/** `afterMock` solo registra el callback, nunca lo ejecuta solo. */
async function flushAfter() {
  const calls = mocks.afterMock.mock.calls.map((call: unknown[]) => call[0] as () => Promise<void>)
  for (const cb of calls) await cb()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.rpcMock.mockResolvedValue({ data: cotizacionEmitida, error: null })
  mocks.getCotizacionByIdMock.mockResolvedValue(cotizacionEmitida)
})

describe('POST /api/cotizaciones/[id]/emitir', () => {
  it('emite la cotización y agenda+ejecuta general_confirmed', async () => {
    const res = await POST(req(), { params })

    expect(res.status).toBe(200)
    expect(mocks.afterMock).toHaveBeenCalledTimes(1)
    expect(mocks.sendRealtimeBroadcastMock).not.toHaveBeenCalled()

    await flushAfter()

    expect(mocks.sendRealtimeBroadcastMock).toHaveBeenCalledWith([{
      topic: 'cotizacion:SH001',
      event: 'general_confirmed',
      payload: { cotizacion_id: 'SH001', at: expect.any(String) },
      private: true,
    }])
  })

  it('responde 404 si la cotización no existe, sin agendar nada', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: null })

    const res = await POST(req(), { params })

    expect(res.status).toBe(404)
    expect(mocks.afterMock).not.toHaveBeenCalled()
  })

  it('responde 400 si la cotización no está en BORRADOR, sin agendar nada', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { error: true, estado_actual: 'EMITIDA' }, error: null })

    const res = await POST(req(), { params })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'Solo se pueden emitir cotizaciones en estado BORRADOR. Estado actual: EMITIDA',
    })
    expect(mocks.afterMock).not.toHaveBeenCalled()
  })

  it('responde 500 si la RPC falla, sin agendar nada', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: new Error('boom') })

    const res = await POST(req(), { params })

    expect(res.status).toBe(500)
    expect(mocks.afterMock).not.toHaveBeenCalled()
  })
})
