import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentasCobrarMock: vi.fn(),
  updateCuentaCobrarMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentasCobrar: mocks.getCuentasCobrarMock,
  updateCuentaCobrar: mocks.updateCuentaCobrarMock,
}))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { GET } from '../cuentas-cobrar/alertas/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.rpcMock.mockResolvedValue({ error: null })
})

// EF-3 3B-1: esta ruta ya no calcula el estado en JS ni escribe cuenta por
// cuenta (updateCuentaCobrar) -- delega el recalculo a la misma RPC única
// que app/api/cuentas-cobrar/route.ts, antes de armar las alertas.
describe('GET /api/cuentas-cobrar/alertas', () => {
  it('llama la RPC de recalculo antes de leer, y nunca escribe estado por su cuenta', async () => {
    mocks.getCuentasCobrarMock.mockResolvedValue([
      { id: 'c1', estado: 'VENCIDO', fecha_vencimiento: '2000-01-01', monto_total: 100, monto_pagado: 0, folio: 'SH001', cotizacion_id: 'SH001', cliente: 'X', proyecto: 'Y' },
    ])
    const res = await GET()
    expect(mocks.rpcMock).toHaveBeenCalledWith('sync_estados_cuentas_cobrar_vencidas')
    expect(mocks.updateCuentaCobrarMock).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total_alertas).toBe(1)
    expect(body.alertas[0].alerta).toBe('VENCIDA')
  })

  it('responde 500 sin exponer el error interno si la RPC falla', async () => {
    mocks.rpcMock.mockResolvedValueOnce({ error: { message: 'db down' } })
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('db down')
  })
})
