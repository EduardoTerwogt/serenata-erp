import { beforeEach, describe, expect, it, vi } from 'vitest'

const getCotizacionByIdMock = vi.fn()
const rpcMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getCotizacionById: getCotizacionByIdMock,
}))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc: rpcMock,
  },
}))

import { approveQuotationAndFetchResult } from '../approval'

describe('approveQuotationAndFetchResult', () => {
  beforeEach(() => {
    getCotizacionByIdMock.mockReset()
    rpcMock.mockReset()
  })

  it('retorna 404 cuando la cotización no existe', async () => {
    getCotizacionByIdMock.mockRejectedValue(new Error('missing'))

    const result = await approveQuotationAndFetchResult('SH001')

    expect(result).toEqual({
      ok: false,
      status: 404,
      body: { error: 'Cotización no encontrada' },
    })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('retorna la cotización actual sin llamar al RPC cuando ya está aprobada', async () => {
    const cotizacion = { id: 'SH001', estado: 'APROBADA' }
    getCotizacionByIdMock.mockResolvedValue(cotizacion)

    const result = await approveQuotationAndFetchResult('SH001')

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: {
        cotizacion,
        already_approved: true,
      },
    })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('mapea a 404 cuando el RPC responde que la cotización no fue encontrada', async () => {
    getCotizacionByIdMock.mockResolvedValue({ id: 'SH001', estado: 'BORRADOR' })
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'cotización no encontrada' },
    })

    const result = await approveQuotationAndFetchResult('SH001')

    expect(result).toEqual({
      ok: false,
      status: 404,
      body: { error: 'cotización no encontrada' },
    })
  })

  it('retorna la cotización aprobada y los artefactos creados por el RPC', async () => {
    getCotizacionByIdMock
      .mockResolvedValueOnce({ id: 'SH001', estado: 'BORRADOR' })
      .mockResolvedValueOnce({ id: 'SH001', estado: 'APROBADA' })

    rpcMock.mockResolvedValue({
      data: {
        already_approved: false,
        cotizacion_id: 'SH001',
        proyecto_id: 'PROY-001',
        cuentas_pagar: [{ id: 'cp-1' }],
        cuenta_cobrar: { id: 'cc-1' },
      },
      error: null,
    })

    const result = await approveQuotationAndFetchResult('SH001')

    expect(rpcMock).toHaveBeenCalledWith('approve_cotizacion', { p_id: 'SH001' })
    expect(result).toEqual({
      ok: true,
      status: 200,
      body: {
        cotizacion: { id: 'SH001', estado: 'APROBADA' },
        proyecto_id: 'PROY-001',
        cuentas_pagar: [{ id: 'cp-1' }],
        cuenta_cobrar: { id: 'cc-1' },
        already_approved: false,
      },
    })
  })
})
