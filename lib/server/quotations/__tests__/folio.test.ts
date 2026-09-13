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

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    from: mocks.fromMock,
    rpc: mocks.rpcMock,
  },
}))

import {
  consumeReservedQuotationFolio,
  invalidateFolioCache,
  previewNextQuotationFolio,
  reserveNextQuotationFolio,
} from '../folio'

/** Principal cotizaciones: .from('cotizaciones').select('id') — select is terminal */
function createPrincipalCotQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockResolvedValue(result),
  }
}

/** Complementaria cotizaciones: .from('cotizaciones').select('id').eq(...) — eq is terminal */
function createCompCotQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    }),
  }
}

/** Reservation query: .select().eq().is().gt() or .select().eq().eq().is().gt() — gt is terminal */
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
    // EF-2 1D-3: previewNextQuotationFolio cachea por 5 min (CacheManager
    // módulo-scoped) -- sin limpiarlo, un test reutilizaría el resultado
    // cacheado por otro que llamó con el mismo baseFolio (ej. sin argumento).
    invalidateFolioCache()
  })

  it('preview principal encuentra el primer gap disponible', async () => {
    // Existen SH001, SH002, SH004 (SH003 fue borrada)
    const cotQuery = createPrincipalCotQuery({
      data: [{ id: 'SH001' }, { id: 'SH002' }, { id: 'SH004' }],
      error: null,
    })
    const resQuery = createReservationQuery({
      data: [],
      error: null,
    })
    mocks.fromMock
      .mockReturnValueOnce(cotQuery)   // cotizaciones
      .mockReturnValueOnce(resQuery)   // reservations

    const folio = await previewNextQuotationFolio()

    expect(folio).toBe('SH003')
  })

  it('preview principal devuelve siguiente si no hay gaps', async () => {
    const cotQuery = createPrincipalCotQuery({
      data: [{ id: 'SH001' }, { id: 'SH002' }, { id: 'SH003' }],
      error: null,
    })
    const resQuery = createReservationQuery({
      data: [],
      error: null,
    })
    mocks.fromMock
      .mockReturnValueOnce(cotQuery)
      .mockReturnValueOnce(resQuery)

    const folio = await previewNextQuotationFolio()

    expect(folio).toBe('SH004')
  })

  it('preview principal respeta reservas activas al buscar gaps', async () => {
    // SH001 existe, SH002 reservada, SH003 libre
    const cotQuery = createPrincipalCotQuery({
      data: [{ id: 'SH001' }],
      error: null,
    })
    const resQuery = createReservationQuery({
      data: [{ folio: 'SH002' }],
      error: null,
    })
    mocks.fromMock
      .mockReturnValueOnce(cotQuery)
      .mockReturnValueOnce(resQuery)

    const folio = await previewNextQuotationFolio()

    expect(folio).toBe('SH003')
  })

  it('preview complementaria encuentra gaps', async () => {
    // SH010-A existe, SH010-B fue borrada, SH010-C existe
    const cotQuery = createCompCotQuery({
      data: [{ id: 'SH010-A' }, { id: 'SH010-C' }],
      error: null,
    })
    const resQuery = createReservationQuery({
      data: [],
      error: null,
    })
    mocks.fromMock
      .mockReturnValueOnce(cotQuery)
      .mockReturnValueOnce(resQuery)

    const folio = await previewNextQuotationFolio('SH010')

    expect(folio).toBe('SH010-B')
  })

  it('preview hace fallback al siguiente folio real cuando no existe la tabla de reservas', async () => {
    mocks.getNextFolioMock.mockResolvedValue('SH010')
    // The first from() call (cotizaciones) succeeds, but the select resolves to null data
    // The second from() call (reservations) throws the missing-table error
    const cotQuery = createPrincipalCotQuery({ data: [], error: null })
    const resQuery = createReservationQuery({
      data: null,
      error: new Error('relation "cotizacion_folio_reservations" does not exist'),
    })
    mocks.fromMock
      .mockReturnValueOnce(cotQuery)
      .mockReturnValueOnce(resQuery)

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

  it('reserveNextQuotationFolio lanza error cuando falta la función RPC (sin fallback no-atómico)', async () => {
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: new Error('Could not find the function public.reserve_next_cotizacion_folio in the schema cache'),
    })

    await expect(reserveNextQuotationFolio()).rejects.toThrow(
      'La función de reserva atómica de folio no está instalada en la base de datos.'
    )
  })

  it('cachea el resultado por baseFolio: dos llamadas con el mismo argumento solo consultan una vez', async () => {
    const cotQuery = createPrincipalCotQuery({ data: [{ id: 'SH001' }], error: null })
    const resQuery = createReservationQuery({ data: [], error: null })
    mocks.fromMock.mockReturnValueOnce(cotQuery).mockReturnValueOnce(resQuery)

    const first = await previewNextQuotationFolio()
    const second = await previewNextQuotationFolio()

    expect(first).toBe('SH002')
    expect(second).toBe('SH002')
    expect(mocks.fromMock).toHaveBeenCalledTimes(2) // solo la primera llamada consultó
  })

  it('un baseFolio distinto no reutiliza la entrada de caché de otro', async () => {
    mocks.fromMock
      .mockReturnValueOnce(createPrincipalCotQuery({ data: [], error: null }))
      .mockReturnValueOnce(createReservationQuery({ data: [], error: null }))
      .mockReturnValueOnce(createCompCotQuery({ data: [], error: null }))
      .mockReturnValueOnce(createReservationQuery({ data: [], error: null }))

    await previewNextQuotationFolio()
    await previewNextQuotationFolio('SH020')

    expect(mocks.fromMock).toHaveBeenCalledTimes(4)
  })

  it('invalidateFolioCache() limpia el caché -- la siguiente llamada vuelve a consultar', async () => {
    mocks.fromMock
      .mockReturnValueOnce(createPrincipalCotQuery({ data: [{ id: 'SH001' }], error: null }))
      .mockReturnValueOnce(createReservationQuery({ data: [], error: null }))

    await previewNextQuotationFolio()
    expect(mocks.fromMock).toHaveBeenCalledTimes(2)

    invalidateFolioCache()

    mocks.fromMock
      .mockReturnValueOnce(createPrincipalCotQuery({ data: [{ id: 'SH001' }, { id: 'SH002' }], error: null }))
      .mockReturnValueOnce(createReservationQuery({ data: [], error: null }))

    const afterInvalidate = await previewNextQuotationFolio()

    expect(afterInvalidate).toBe('SH003')
    expect(mocks.fromMock).toHaveBeenCalledTimes(4)
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
