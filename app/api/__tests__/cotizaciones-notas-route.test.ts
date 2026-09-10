import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCotizacionByIdMock: vi.fn(),
  saveNotasInternasMock: vi.fn(async () => undefined),
  sendRealtimeBroadcastMock: vi.fn(async () => undefined),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({ getCotizacionById: mocks.getCotizacionByIdMock }))
vi.mock('@/lib/server/quotations/persistence', () => ({ saveNotasInternas: mocks.saveNotasInternasMock }))
vi.mock('@/lib/server/realtime/broadcast', () => ({ sendRealtimeBroadcast: mocks.sendRealtimeBroadcastMock }))

import { PATCH } from '../cotizaciones/[id]/notas/route'

const params = Promise.resolve({ id: 'SH001' })
const req = (body: unknown) => new Request('http://x/api/cotizaciones/SH001/notas', {
  method: 'PATCH',
  body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.getCotizacionByIdMock.mockResolvedValue({ id: 'SH001', notas_internas: 'nota nueva' })
})

describe('PATCH /api/cotizaciones/[id]/notas', () => {
  it('guarda las notas y emite notas_confirmed tras el commit', async () => {
    const res = await PATCH(req({ notas_internas: 'nota nueva' }), { params })

    expect(res.status).toBe(200)
    expect(mocks.saveNotasInternasMock).toHaveBeenCalledWith('SH001', 'nota nueva')
    expect(mocks.sendRealtimeBroadcastMock).toHaveBeenCalledWith([{
      topic: 'cotizacion:SH001',
      event: 'notas_confirmed',
      payload: { cotizacion_id: 'SH001', at: expect.any(String) },
      private: true,
    }])
  })

  it('si guardar falla, responde 500 y no emite el evento', async () => {
    mocks.saveNotasInternasMock.mockRejectedValueOnce(new Error('boom'))

    const res = await PATCH(req({ notas_internas: 'x' }), { params })

    expect(res.status).toBe(500)
    expect(mocks.sendRealtimeBroadcastMock).not.toHaveBeenCalled()
  })
})
