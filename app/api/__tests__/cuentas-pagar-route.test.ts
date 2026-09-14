import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  buscarCuentasPagarMock: vi.fn(),
  updateCuentaPagarMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/db', () => ({
  buscarCuentasPagar: mocks.buscarCuentasPagarMock,
  updateCuentaPagar: mocks.updateCuentaPagarMock,
}))

import { GET, PUT } from '../cuentas-pagar/route'

function buildPutRequest(body: unknown) {
  return new Request('http://localhost/api/cuentas-pagar', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mocks.requireSectionMock.mockReset().mockResolvedValue({ response: null })
  mocks.buscarCuentasPagarMock.mockReset().mockResolvedValue({
    rows: [{ id: 'c1', estado: 'PENDIENTE' }],
    total_rows: 1,
    total_monto_pendiente: 0,
    total_monto_pagado: 0,
    pendientes_count: 1,
  })
  mocks.updateCuentaPagarMock.mockReset().mockResolvedValue({ id: 'cuenta-1', notas: 'ok' })
})

// EF-3 3B-3: GET delega busqueda/paginacion/totales a la RPC unica
// buscar_cuentas_pagar (via buscarCuentasPagar()) -- ya no llama
// getCuentasPagar() (arreglo completo con .limit(500)).
describe('GET /api/cuentas-pagar', () => {
  it('llama buscarCuentasPagar con los defaults cuando no hay querystring', async () => {
    const res = await GET(new Request('http://localhost/api/cuentas-pagar'))
    expect(mocks.buscarCuentasPagarMock).toHaveBeenCalledWith(null, 1, 50)
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
    expect(mocks.buscarCuentasPagarMock).toHaveBeenCalledWith('ITEM_01', 2, 20)
  })

  it('responde 500 sin exponer el error interno si la RPC falla', async () => {
    mocks.buscarCuentasPagarMock.mockRejectedValueOnce(new Error('db down'))
    const res = await GET(new Request('http://localhost/api/cuentas-pagar'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('db down')
  })
})

describe('PUT /api/cuentas-pagar', () => {
  it.each(['estado', 'fecha_pago', 'monto_pagado'])(
    '1B-4 -- rechaza (400) el update completo si el body incluye "%s", sin llamar a updateCuentaPagar',
    async (forbiddenKey) => {
      const response = await PUT(buildPutRequest({ id: 'cuenta-1', notas: 'nota válida', [forbiddenKey]: 'x' }))

      expect(response.status).toBe(400)
      expect(mocks.updateCuentaPagarMock).not.toHaveBeenCalled()
    }
  )

  it('1B-4 -- rechaza el update completo si vienen mezclados campos permitidos y prohibidos', async () => {
    const response = await PUT(
      buildPutRequest({ id: 'cuenta-1', notas: 'nota válida', orden_pago_id: 'op-1', estado: 'PAGADO' })
    )

    expect(response.status).toBe(400)
    expect(mocks.updateCuentaPagarMock).not.toHaveBeenCalled()
  })

  it('permite notas y orden_pago_id', async () => {
    const response = await PUT(buildPutRequest({ id: 'cuenta-1', notas: 'nota válida', orden_pago_id: 'op-1' }))

    expect(response.status).toBe(200)
    expect(mocks.updateCuentaPagarMock).toHaveBeenCalledWith('cuenta-1', { notas: 'nota válida', orden_pago_id: 'op-1' })
  })

  it('descarta silenciosamente claves desconocidas que no son financieras prohibidas', async () => {
    const response = await PUT(buildPutRequest({ id: 'cuenta-1', notas: 'nota válida', campo_inventado: 'x' }))

    expect(response.status).toBe(200)
    expect(mocks.updateCuentaPagarMock).toHaveBeenCalledWith('cuenta-1', { notas: 'nota válida' })
  })
})
