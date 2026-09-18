import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { reconcilePagoEstado } from '../reconcilePago'

describe('reconcilePagoEstado', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('cuentas-pagar/cuentas-cobrar: construye la URL bajo /api/<dominio>/<id>/registrar-pago/estado', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'not_found' }) })
    await reconcilePagoEstado('cuentas-pagar', 'cuenta-1', 'op-1')
    expect(fetchMock).toHaveBeenCalledWith('/api/cuentas-pagar/cuenta-1/registrar-pago/estado?operation_id=op-1')
  })

  it('cuentas-pagar-grupos: construye la URL bajo el sub-recurso /api/cuentas-pagar/grupos/<id>/registrar-pago/estado', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'not_found' }) })
    await reconcilePagoEstado('cuentas-pagar-grupos', 'grupo-1', 'op-1')
    expect(fetchMock).toHaveBeenCalledWith('/api/cuentas-pagar/grupos/grupo-1/registrar-pago/estado?operation_id=op-1')
  })

  it('completed: propaga el result', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', result: { success: true } }) })
    const res = await reconcilePagoEstado('cuentas-pagar-grupos', 'grupo-1', 'op-1')
    expect(res).toEqual({ status: 'completed', result: { success: true } })
  })

  it('ambiguous se propaga sin result', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'ambiguous' }) })
    const res = await reconcilePagoEstado('cuentas-pagar-grupos', 'grupo-1', 'op-1')
    expect(res).toEqual({ status: 'ambiguous' })
  })

  it('un fallo de red se trata como not_found -- nunca libera nada', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const res = await reconcilePagoEstado('cuentas-pagar-grupos', 'grupo-1', 'op-1')
    expect(res).toEqual({ status: 'not_found' })
  })
})
