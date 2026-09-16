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

/** Complementaria cotizaciones: .from('cotizaciones').select('id').eq(...) — eq is terminal */
function createCompCotQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    }),
  }
}

/** Reservation query: .select().eq().eq().or() — or is terminal (F14d: cuenta reservas consumidas o activas, no solo activas) */
function createReservationQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockResolvedValue(result),
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

  it('preview principal llama a la RPC de folio (EF-3 3B-7) y regresa lo que responde', async () => {
    // EF-3 3B-7: el hueco libre desde 1 ahora se calcula en SQL
    // (preview_next_cotizacion_folio_principal) -- la lógica de huecos en
    // sí se valida por paridad JS-vs-RPC contra serenata-erp-test, no aquí.
    mocks.rpcMock.mockResolvedValue({ data: 'SH003', error: null })

    const folio = await previewNextQuotationFolio()

    expect(mocks.rpcMock).toHaveBeenCalledWith('preview_next_cotizacion_folio_principal')
    expect(mocks.fromMock).not.toHaveBeenCalled()
    expect(folio).toBe('SH003')
  })

  it('preview principal hace fallback a getNextFolio() cuando la RPC no existe', async () => {
    mocks.getNextFolioMock.mockResolvedValue('SH010')
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: new Error('Could not find the function public.preview_next_cotizacion_folio_principal in the schema cache'),
    })

    const folio = await previewNextQuotationFolio()

    expect(folio).toBe('SH010')
    expect(mocks.getNextFolioMock).toHaveBeenCalled()
  })

  it('preview principal propaga un error real de la RPC (no lo confunde con función faltante)', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: new Error('conexión perdida') })

    await expect(previewNextQuotationFolio()).rejects.toThrow('conexión perdida')
    expect(mocks.getNextFolioMock).not.toHaveBeenCalled()
  })

  it('preview principal lanza error si la RPC no devuelve un folio válido (y no cae al fallback)', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: null })

    await expect(previewNextQuotationFolio()).rejects.toThrow(
      'La RPC de folio principal no devolvió un folio válido'
    )
    expect(mocks.getNextFolioMock).not.toHaveBeenCalled()
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

  it('preview complementaria hace fallback a getNextFolioComplementaria cuando no existe la tabla de reservas', async () => {
    mocks.getNextFolioComplementariaMock.mockResolvedValue('SH010-D')
    const cotQuery = createCompCotQuery({ data: [], error: null })
    const resQuery = createReservationQuery({
      data: null,
      error: new Error('relation "cotizacion_folio_reservations" does not exist'),
    })
    mocks.fromMock
      .mockReturnValueOnce(cotQuery)
      .mockReturnValueOnce(resQuery)

    const folio = await previewNextQuotationFolio('SH010')

    expect(folio).toBe('SH010-D')
    expect(mocks.getNextFolioComplementariaMock).toHaveBeenCalledWith('SH010')
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
    mocks.rpcMock.mockResolvedValueOnce({ data: 'SH002', error: null })

    const first = await previewNextQuotationFolio()
    const second = await previewNextQuotationFolio()

    expect(first).toBe('SH002')
    expect(second).toBe('SH002')
    expect(mocks.rpcMock).toHaveBeenCalledTimes(1) // solo la primera llamada consultó
  })

  it('un baseFolio distinto no reutiliza la entrada de caché de otro', async () => {
    mocks.rpcMock.mockResolvedValueOnce({ data: 'SH001', error: null })
    mocks.fromMock
      .mockReturnValueOnce(createCompCotQuery({ data: [], error: null }))
      .mockReturnValueOnce(createReservationQuery({ data: [], error: null }))

    await previewNextQuotationFolio()
    await previewNextQuotationFolio('SH020')

    expect(mocks.rpcMock).toHaveBeenCalledTimes(1)
    expect(mocks.fromMock).toHaveBeenCalledTimes(2)
  })

  it('invalidateFolioCache() limpia el caché -- la siguiente llamada vuelve a consultar', async () => {
    mocks.rpcMock.mockResolvedValueOnce({ data: 'SH002', error: null })

    await previewNextQuotationFolio()
    expect(mocks.rpcMock).toHaveBeenCalledTimes(1)

    invalidateFolioCache()

    mocks.rpcMock.mockResolvedValueOnce({ data: 'SH003', error: null })
    const afterInvalidate = await previewNextQuotationFolio()

    expect(afterInvalidate).toBe('SH003')
    expect(mocks.rpcMock).toHaveBeenCalledTimes(2)
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
