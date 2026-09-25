import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  buscarCuentasPagarGruposMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/db', () => ({
  buscarCuentasPagarGrupos: mocks.buscarCuentasPagarGruposMock,
}))

import * as route from '../cuentas-pagar/route'

const { GET } = route

beforeEach(() => {
  mocks.requireSectionMock.mockReset().mockResolvedValue({ response: null })
  mocks.buscarCuentasPagarGruposMock.mockReset().mockResolvedValue({
    rows: [{ id: 'c1', estado: 'PENDIENTE' }],
    total_rows: 1,
    total_monto_pendiente: 0,
    total_monto_pagado: 0,
    pendientes_count: 1,
  })
})

// Bloque 6: GET delega busqueda/paginacion/totales a la RPC unica
// buscar_cuentas_pagar_grupos (via buscarCuentasPagarGrupos()) -- una fila
// por grupo/responsable, no por item.
describe('GET /api/cuentas-pagar', () => {
  it('llama buscarCuentasPagarGrupos con los defaults cuando no hay querystring', async () => {
    const res = await GET(new Request('http://localhost/api/cuentas-pagar'))
    expect(mocks.buscarCuentasPagarGruposMock).toHaveBeenCalledWith(null, 1, 50)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      rows: [{ id: 'c1', estado: 'PENDIENTE' }],
      total_rows: 1,
      total_monto_pendiente: 0,
      total_monto_pagado: 0,
      pendientes_count: 1,
    })
  })

  it('parsea search/page/pageSize del querystring', async () => {
    await GET(new Request('http://localhost/api/cuentas-pagar?search=ITEM_01&page=2&pageSize=20'))
    expect(mocks.buscarCuentasPagarGruposMock).toHaveBeenCalledWith('ITEM_01', 2, 20)
  })

  it('responde 500 sin exponer el error interno si la RPC falla', async () => {
    mocks.buscarCuentasPagarGruposMock.mockRejectedValueOnce(new Error('db down'))
    const res = await GET(new Request('http://localhost/api/cuentas-pagar'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('db down')
  })
})

describe('PUT /api/cuentas-pagar', () => {
  it('B1b (H4): ya no existe -- orden_pago_id/estado solo cambian por sus RPCs', () => {
    expect('PUT' in route).toBe(false)
  })
})
