import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  buscarCuentasCobrarMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  buscarCuentasCobrar: mocks.buscarCuentasCobrarMock,
}))

import * as route from '../cuentas-cobrar/route'

const { GET } = route

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.buscarCuentasCobrarMock.mockResolvedValue({
    rows: [{ id: 'c1', estado: 'FACTURADO' }],
    total_rows: 1,
    total_monto_pendiente: 0,
    total_monto_pagado: 0,
    pendientes_count: 0,
  })
})

// EF-3 3B-2: GET delega busqueda/paginacion/totales a la RPC unica
// buscar_cuentas_cobrar (via buscarCuentasCobrar()) -- ya no llama
// sync_estados_cuentas_cobrar_vencidas() por su cuenta (la RPC la llama
// internamente) ni getCuentasCobrar() sin limite.
describe('GET /api/cuentas-cobrar', () => {
  it('llama buscarCuentasCobrar con los defaults cuando no hay querystring', async () => {
    const res = await GET(new Request('http://localhost/api/cuentas-cobrar'))
    expect(mocks.buscarCuentasCobrarMock).toHaveBeenCalledWith(null, 1, 50)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      rows: [{ id: 'c1', estado: 'FACTURADO' }],
      total_rows: 1,
      total_monto_pendiente: 0,
      total_monto_pagado: 0,
      pendientes_count: 0,
    })
  })

  it('parsea search/page/pageSize del querystring', async () => {
    await GET(new Request('http://localhost/api/cuentas-cobrar?search=SH001&page=2&pageSize=20'))
    expect(mocks.buscarCuentasCobrarMock).toHaveBeenCalledWith('SH001', 2, 20)
  })

  it('responde 500 sin exponer el error interno si la RPC falla', async () => {
    mocks.buscarCuentasCobrarMock.mockRejectedValueOnce(new Error('db down'))
    const res = await GET(new Request('http://localhost/api/cuentas-cobrar'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('db down')
  })
})

describe('PUT /api/cuentas-cobrar', () => {
  it('B1b (H4): ya no existe -- estado y monto_pagado solo cambian por sus RPCs', () => {
    expect('PUT' in route).toBe(false)
  })
})
