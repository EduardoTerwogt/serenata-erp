import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCotizacionByIdMock: vi.fn(),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getCotizacionById: mocks.getCotizacionByIdMock,
}))

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: mocks.rpcMock,
    from: mocks.fromMock,
  },
}))

import { cancelQuotation } from '../cancellation'

// Helper: mock cuentas_cobrar query to return no payments (cancellation allowed)
function mockNoPayments() {
  mocks.fromMock.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  })
}

// Helper: mock cuentas_cobrar query to return existing payments (cancellation blocked)
function mockWithPayments(montoPagado: number) {
  mocks.fromMock.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [{ id: 'cc-1', monto_pagado: montoPagado }],
        error: null,
      }),
    }),
  })
}

describe('cancelQuotation', () => {
  beforeEach(() => {
    mocks.getCotizacionByIdMock.mockReset()
    mocks.rpcMock.mockReset()
    mocks.fromMock.mockReset()
  })

  it('successfully cancels an EMITIDA quotation using RPC transaction', async () => {
    const quotationId = 'SH001'
    const cotizacion = { id: quotationId, estado: 'EMITIDA', cliente: 'ACME' }

    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)
    mockNoPayments()
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
    mockNoPayments()
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

  it('throws error when cotizacion has existing payments', async () => {
    const quotationId = 'SH005'
    const cotizacion = { id: quotationId, estado: 'APROBADA', cliente: 'Paid Client' }

    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)
    mockWithPayments(5000)

    await expect(cancelQuotation(quotationId)).rejects.toThrow(
      'No se puede cancelar: ya existe un pago de $5000.00 registrado',
    )

    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('throws error when RPC call fails -- EF-3 3D-9: DomainError con safeMessage genérico, sin el detalle crudo de Postgres', async () => {
    const quotationId = 'SH006'
    const cotizacion = { id: quotationId, estado: 'EMITIDA', cliente: 'Will Fail' }

    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)
    mockNoPayments()
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Database constraint violation' },
    })

    await expect(cancelQuotation(quotationId)).rejects.toMatchObject({
      name: 'DomainError',
      status: 500,
      safeMessage: expect.not.stringContaining('Database constraint violation'),
      cause: { message: 'Database constraint violation' },
    })
  })

  it('throws DomainError when verifying existing payments fails at the DB level -- EF-3 3D-9: sin el detalle crudo de Postgres', async () => {
    const quotationId = 'SH008'
    const cotizacion = { id: quotationId, estado: 'EMITIDA', cliente: 'DB Down' }

    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)
    mocks.fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'conexión perdida' } }),
      }),
    })

    await expect(cancelQuotation(quotationId)).rejects.toMatchObject({
      name: 'DomainError',
      status: 500,
      safeMessage: expect.not.stringContaining('conexión perdida'),
      cause: { message: 'conexión perdida' },
    })
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('throws error when quotation is not found', async () => {
    const quotationId = 'SH999'

    mocks.getCotizacionByIdMock.mockRejectedValue(new Error('Not found'))

    await expect(cancelQuotation(quotationId)).rejects.toThrow('Not found')

    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('uses RPC transaction for atomicity - ensures all-or-nothing semantics', async () => {
    const quotationId = 'SH007'
    const cotizacion = { id: quotationId, estado: 'APROBADA' }

    mocks.getCotizacionByIdMock.mockResolvedValue(cotizacion)
    mockNoPayments()
    mocks.rpcMock.mockResolvedValue({
      data: [{ id: quotationId, estado: 'CANCELADA' }],
      error: null,
    })

    await cancelQuotation(quotationId)

    // Verify RPC (not individual delete operations) is called
    expect(mocks.rpcMock).toHaveBeenCalledTimes(1)
    expect(mocks.rpcMock).toHaveBeenCalledWith('cancel_cotizacion', { p_id: quotationId })
  })

  it('B1b: una guarda de la RPC (cancelacion_bloqueada, P1413) sale como 409 con el folio y el motivo', async () => {
    const quotationId = 'SH008'
    mocks.getCotizacionByIdMock.mockResolvedValue({ id: quotationId, estado: 'APROBADA' })
    mockNoPayments()
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'P1413', message: 'cancelacion_bloqueada: la cotización SH008-A tiene cuentas en una orden de pago' },
    })

    await expect(cancelQuotation(quotationId)).rejects.toMatchObject({
      name: 'DomainError',
      code: 'cancelacion_bloqueada',
      status: 409,
      safeMessage: 'No se puede cancelar: la cotización SH008-A tiene cuentas en una orden de pago.',
    })
  })
})

