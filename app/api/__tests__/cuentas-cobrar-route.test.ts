import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentasCobrarMock: vi.fn(),
  updateCuentaCobrarMock: vi.fn(),
  rpcMock: vi.fn(),
  triggerSheetsSyncMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentasCobrar: mocks.getCuentasCobrarMock,
  updateCuentaCobrar: mocks.updateCuentaCobrarMock,
}))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))
vi.mock('@/lib/integrations/sheets/trigger', () => ({ triggerSheetsSync: mocks.triggerSheetsSyncMock }))

import { GET } from '../cuentas-cobrar/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.rpcMock.mockResolvedValue({ error: null })
  mocks.getCuentasCobrarMock.mockResolvedValue([{ id: 'c1', estado: 'FACTURADO' }])
})

// EF-3 3B-1: GET ya no recalcula/escribe estados en JS (syncEstadosVencidos
// eliminada) -- delega el recalculo a la RPC unica antes de leer.
describe('GET /api/cuentas-cobrar', () => {
  it('llama la RPC de recalculo antes de leer las cuentas', async () => {
    const res = await GET()
    expect(mocks.rpcMock).toHaveBeenCalledWith('sync_estados_cuentas_cobrar_vencidas')
    expect(mocks.getCuentasCobrarMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([{ id: 'c1', estado: 'FACTURADO' }])
  })

  it('nunca escribe estado por su cuenta (updateCuentaCobrar no se llama en GET)', async () => {
    await GET()
    expect(mocks.updateCuentaCobrarMock).not.toHaveBeenCalled()
  })

  it('responde 500 sin exponer el error interno si la RPC falla', async () => {
    mocks.rpcMock.mockResolvedValueOnce({ error: { message: 'db down' } })
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('db down')
  })
})
