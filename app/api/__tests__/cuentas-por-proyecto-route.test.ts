import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { GET } from '../cuentas/por-proyecto/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
})

// EF-3 3B-9: esta ruta ya no trae proyectos+cuentas_cobrar+cuentas_pagar
// completos ni agrupa/suma en Node -- delega el agregado a la RPC única
// cuentas_por_proyecto. La paridad del agregado (conteo, totales, orden
// externo e interno) contra el código JS anterior se verificó en vivo
// contra serenata-erp-test, documentada en el PR.
describe('GET /api/cuentas/por-proyecto', () => {
  it('requiere la sección cuentas', async () => {
    const denyResponse = Response.json({ error: 'no autorizado' }, { status: 403 })
    mocks.requireSectionMock.mockResolvedValueOnce({ response: denyResponse })

    const res = await GET()

    expect(res.status).toBe(403)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('llama la RPC cuentas_por_proyecto y envuelve el resultado en { proyectos }', async () => {
    const filas = [
      { proyecto: { id: 'SH003', folio: 'SH003', nombre: 'Doc', cliente: 'X', estado: 'RODAJE' }, cuentas_cobrar: [], cuentas_pagar: [], total_cobrar: 0, total_pagar: 0 },
    ]
    mocks.rpcMock.mockResolvedValue({ data: filas, error: null })

    const res = await GET()

    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_por_proyecto')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ proyectos: filas })
  })

  it('responde 500 sin exponer el error interno si la RPC falla', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { message: 'db down' } })

    const res = await GET()

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('db down')
  })
})
