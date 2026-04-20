import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCotizacionByIdMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getCotizacionById: mocks.getCotizacionByIdMock,
}))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc: mocks.rpcMock,
  },
}))

vi.mock('@/app/api/folio/route', () => ({
  invalidateFolioCache: vi.fn(),
}))

import { approveQuotationAndFetchResult } from '../approval'

describe('approveQuotationAndFetchResult', () => {
  beforeEach(() => {
    mocks.getCotizacionByIdMock.mockReset()
    mocks.rpcMock.mockReset()
  })

  it('retorna 404 cuando la cotización no existe', async () => {
    mocks.getCotizacionByIdMock.mockRejectedValue(new Error('missing'))

    const result = await approveQuotationAndFetchResult('SH001')

    expect(result).toEqual({
      ok: false,
      status: 404,
      body: { error: 'Cotización no encontrada' },
    })
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('retorna la cotización actual sin llamar al RPC cuando ya está aprobada', async () => {
    const cotizacion = { id: 'SH001', estado: 'APROBADA' }
    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)

    const result = await approveQuotationAndFetchResult('SH001')

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: {
        cotizacion,
        already_approved: true,
      },
    })
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('retorna 400 cuando se intenta aprobar desde BORRADOR (debe pasar por EMITIDA)', async () => {
    mocks.getCotizacionByIdMock.mockResolvedValue({ id: 'SH001', estado: 'BORRADOR' })

    const result = await approveQuotationAndFetchResult('SH001')

    expect(result).toEqual({
      ok: false,
      status: 400,
      body: {
        error: 'Solo se pueden aprobar cotizaciones en estado EMITIDA. Estado actual: BORRADOR',
      },
    })
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('mapea a 404 cuando el RPC responde que la cotización no fue encontrada', async () => {
    // La cotización debe estar EMITIDA para que la guardia de estado pase
    mocks.getCotizacionByIdMock.mockResolvedValue({ id: 'SH001', estado: 'EMITIDA' })
    mocks.rpcMock.mockResolvedValue({
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
    mocks.getCotizacionByIdMock
      .mockResolvedValueOnce({ id: 'SH001', estado: 'EMITIDA' })
      .mockResolvedValueOnce({ id: 'SH001', estado: 'APROBADA' })

    mocks.rpcMock.mockResolvedValue({
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

    expect(mocks.rpcMock).toHaveBeenCalledWith('approve_cotizacion', { p_id: 'SH001' })
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
