import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getNextFolioMock: vi.fn(),
  getNextFolioComplementariaMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getNextFolio: mocks.getNextFolioMock,
  getNextFolioComplementaria: mocks.getNextFolioComplementariaMock,
}))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: mocks.fromMock,
    rpc: mocks.rpcMock,
  },
}))

import {
  consumeReservedQuotationFolio,
  previewNextQuotationFolio,
  reserveNextQuotationFolio,
} from '../folio'

function createReservationQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gt: vi.fn().mockResolvedValue(result),
  }
}

describe('quotation folio helpers', () => {
  beforeEach(() => {
    mocks.getNextFolioMock.mockReset()
    mocks.getNextFolioComplementariaMock.mockReset()
    mocks.fromMock.mockReset()
    mocks.rpcMock.mockReset()
  })

  it('preview principal toma en cuenta la reserva activa más alta', async () => {
    mocks.getNextFolioMock.mockResolvedValue('SH005')
    const query = createReservationQuery({
      data: [{ folio: 'SH006' }, { folio: 'SH008' }],
      error: null,
    })
    mocks.fromMock.mockReturnValue(query)

    const folio = await previewNextQuotationFolio()

    expect(folio).toBe('SH009')
    expect(mocks.fromMock).toHaveBeenCalledWith('cotizacion_folio_reservations')
    expect(query.eq).toHaveBeenCalledWith('kind', 'PRINCIPAL')
  })

  it('preview complementaria toma en cuenta la reserva activa más alta de la base', async () => {
    mocks.getNextFolioComplementariaMock.mockResolvedValue('SH010-B')
    const query = createReservationQuery({
      data: [{ folio: 'SH010-C' }],
      error: null,
    })
    mocks.fromMock.mockReturnValue(query)

    const folio = await previewNextQuotationFolio('SH010')

    expect(folio).toBe('SH010-D')
    expect(query.eq).toHaveBeenCalledWith('kind', 'COMPLEMENTARIA')
    expect(query.eq).toHaveBeenCalledWith('base_folio', 'SH010')
  })

  it('preview hace fallback al siguiente folio real cuando no existe la tabla de reservas', async () => {
    mocks.getNextFolioMock.mockResolvedValue('SH010')
    const query = createReservationQuery({
      data: null,
      error: new Error('relation "cotizacion_folio_reservations" does not exist'),
    })
    mocks.fromMock.mockReturnValue(query)

    const folio = await previewNextQuotationFolio()

    expect(folio).toBe('SH010')
  })

  it('reserveNextQuotationFolio usa el RPC atómico cuando está disponible', async () => {
    mocks.rpcMock.mockResolvedValue({
      data: {
        folio: 'SH011',
        token: 'token-123',
        atomic: true,
        expires_at: '2026-04-08T12:00:00.000Z',
      },
      error: null,
    })

    const reservation = await reserveNextQuotationFolio()

    expect(mocks.rpcMock).toHaveBeenCalledWith('reserve_next_cotizacion_folio', {
      p_base_folio: null,
    })
    expect(reservation).toEqual({
      folio: 'SH011',
      reservationToken: 'token-123',
      atomic: true,
      expiresAt: '2026-04-08T12:00:00.000Z',
    })
  })

  it('reserveNextQuotationFolio hace fallback no atómico cuando falta la función RPC', async () => {
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: new Error('Could not find the function public.reserve_next_cotizacion_folio in the schema cache'),
    })
    mocks.getNextFolioMock.mockResolvedValue('SH012')

    const reservation = await reserveNextQuotationFolio()

    expect(reservation).toEqual({
      folio: 'SH012',
      reservationToken: null,
      atomic: false,
      expiresAt: null,
    })
  })

  it('consumeReservedQuotationFolio no llama al RPC sin token y falla si la reserva ya expiró', async () => {
    await expect(consumeReservedQuotationFolio('SH013', null)).resolves.toBeUndefined()
    expect(mocks.rpcMock).not.toHaveBeenCalled()

    mocks.rpcMock.mockResolvedValue({
      data: false,
      error: null,
    })

    await expect(consumeReservedQuotationFolio('SH013', 'token-013')).rejects.toThrow(
      'La reserva de folio expiró o ya fue utilizada. Recarga la página e inténtalo de nuevo.',
    )
  })
})
