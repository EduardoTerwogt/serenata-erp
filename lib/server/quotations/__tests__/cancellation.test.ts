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

import { cancelQuotation } from '../cancellation'

describe('cancelQuotation', () => {
  beforeEach(() => {
    mocks.getCotizacionByIdMock.mockReset()
    mocks.rpcMock.mockReset()
  })

  it('successfully cancels an EMITIDA quotation using RPC transaction', async () => {
    const quotationId = 'SH001'
    const cotizacion = { id: quotationId, estado: 'EMITIDA', cliente: 'ACME' }

    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)
    mocks.rpcMock.mockResolvedValue({
      data: [{ id: quotationId, estado: 'CANCELADA' }],
      error: null,
    })

    const result = await cancelQuotation(quotationId)

    expect(mocks.getCotizacionByIdMock).toHaveBeenCalledWith(quotationId)
    expect(mocks.rpcMock).toHaveBeenCalledWith('cancel_cotizacion', { p_id: quotationId })
    expect(result).toEqual({
      id: quotationId,
      estado: 'CANCELADA',
      cliente: 'ACME',
    })
  })

  it('successfully cancels an APROBADA quotation using RPC transaction', async () => {
    const quotationId = 'SH002'
    const cotizacion = { id: quotationId, estado: 'APROBADA', cliente: 'TechCorp' }

    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)
    mocks.rpcMock.mockResolvedValue({
      data: [{ id: quotationId, estado: 'CANCELADA' }],
      error: null,
    })

    const result = await cancelQuotation(quotationId)

    expect(mocks.rpcMock).toHaveBeenCalledWith('cancel_cotizacion', { p_id: quotationId })
    expect(result.estado).toBe('CANCELADA')
  })

  it('throws error when trying to cancel a BORRADOR quotation', async () => {
    const quotationId = 'SH003'
    const cotizacion = { id: quotationId, estado: 'BORRADOR', cliente: 'Draft Co' }

    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)

    await expect(cancelQuotation(quotationId)).rejects.toThrow(
      'Solo se pueden cancelar cotizaciones en estado EMITIDA o APROBADA',
    )

    // RPC should NOT be called if estado validation fails
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('throws error when trying to cancel an already CANCELADA quotation', async () => {
    const quotationId = 'SH004'
    const cotizacion = { id: quotationId, estado: 'CANCELADA', cliente: 'Already Cancelled' }

    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)

    await expect(cancelQuotation(quotationId)).rejects.toThrow(
      'Solo se pueden cancelar cotizaciones en estado EMITIDA o APROBADA',
    )

    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('throws error when RPC call fails', async () => {
    const quotationId = 'SH005'
    const cotizacion = { id: quotationId, estado: 'EMITIDA', cliente: 'Will Fail' }

    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Database constraint violation' },
    })

    await expect(cancelQuotation(quotationId)).rejects.toThrow(
      'Error cancelando cotizacion: Database constraint violation',
    )
  })

  it('throws error when quotation is not found', async () => {
    const quotationId = 'SH999'

    mocks.getCotizacionByIdMock.mockRejectedValue(new Error('Not found'))

    await expect(cancelQuotation(quotationId)).rejects.toThrow('Not found')

    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('uses RPC transaction for atomicity - ensures all-or-nothing semantics', async () => {
    const quotationId = 'SH006'
    const cotizacion = { id: quotationId, estado: 'APROBADA' }

    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)
    mocks.rpcMock.mockResolvedValue({
      data: [{ id: quotationId, estado: 'CANCELADA' }],
      error: null,
    })

    await cancelQuotation(quotationId)

    // Verify RPC (not individual delete operations) is called
    expect(mocks.rpcMock).toHaveBeenCalledTimes(1)
    expect(mocks.rpcMock).toHaveBeenCalledWith('cancel_cotizacion', { p_id: quotationId })
  })
})
