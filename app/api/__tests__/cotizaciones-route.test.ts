import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getCotizacionByIdMock: vi.fn(),
  buildCreateCotizacionPayloadMock: vi.fn(),
  createOrReplaceCotizacionMock: vi.fn(),
  runQuotationNonCriticalAutosavesMock: vi.fn(),
  validateMock: vi.fn(),
  reserveNextQuotationFolioMock: vi.fn(),
  consumeReservedQuotationFolioMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/db', () => ({
  getCotizacionById: mocks.getCotizacionByIdMock,
}))

vi.mock('@/lib/server/quotations/persistence', () => ({
  buildCreateCotizacionPayload: mocks.buildCreateCotizacionPayloadMock,
  createOrReplaceCotizacion: mocks.createOrReplaceCotizacionMock,
  runQuotationNonCriticalAutosaves: mocks.runQuotationNonCriticalAutosavesMock,
}))

vi.mock('@/lib/validation/schemas', () => ({
  CotizacionCreateSchema: {},
  validate: mocks.validateMock,
}))

vi.mock('@/lib/server/quotations/folio', () => ({
  reserveNextQuotationFolio: mocks.reserveNextQuotationFolioMock,
  consumeReservedQuotationFolio: mocks.consumeReservedQuotationFolioMock,
}))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {},
}))

import { POST } from '../cotizaciones/route'

describe('POST /api/cotizaciones', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset()
    mocks.getCotizacionByIdMock.mockReset()
    mocks.buildCreateCotizacionPayloadMock.mockReset()
    mocks.createOrReplaceCotizacionMock.mockReset()
    mocks.runQuotationNonCriticalAutosavesMock.mockReset()
    mocks.validateMock.mockReset()
    mocks.reserveNextQuotationFolioMock.mockReset()
    mocks.consumeReservedQuotationFolioMock.mockReset()
    mocks.requireSectionMock.mockResolvedValue({ response: null })
  })

  it('reserva folio al guardar, persiste la cotización y regresa 201', async () => {
    mocks.validateMock.mockReturnValue({
      ok: true,
      data: {
        cliente: 'ACME',
        proyecto: 'Evento de marca',
        fecha_entrega: '2026-04-10',
        locacion: 'CDMX',
        items: [{ descripcion: 'Audio', precio_unitario: 1000, x_pagar: 800 }],
        porcentaje_fee: 0.15,
        iva_activo: true,
        descuento_tipo: 'monto',
        descuento_valor: 0,
      },
    })

    mocks.reserveNextQuotationFolioMock.mockResolvedValue({
      folio: 'SH007',
      reservationToken: 'token-007',
      atomic: true,
      expiresAt: '2026-04-08T12:00:00.000Z',
    })

    mocks.buildCreateCotizacionPayloadMock.mockResolvedValue({
      folio: 'SH007',
      payload: { id: 'SH007', cliente: 'ACME' },
    })

    mocks.getCotizacionByIdMock.mockResolvedValue({ id: 'SH007', estado: 'BORRADOR' })

    const response = await POST(
      new Request('http://localhost/api/cotizaciones', {
        method: 'POST',
        body: JSON.stringify({ cliente: 'ACME', proyecto: 'Evento de marca' }),
      }),
    )

    expect(mocks.reserveNextQuotationFolioMock).toHaveBeenCalledWith(undefined)
    expect(mocks.buildCreateCotizacionPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'SH007', cliente: 'ACME' }),
      [{ descripcion: 'Audio', precio_unitario: 1000, x_pagar: 800 }],
      expect.objectContaining({ forcedFolio: 'SH007', preventOverwrite: true }),
    )
    expect(mocks.createOrReplaceCotizacionMock).toHaveBeenCalledWith({ id: 'SH007', cliente: 'ACME' })
    expect(mocks.consumeReservedQuotationFolioMock).toHaveBeenCalledWith('SH007', 'token-007')
    expect(mocks.runQuotationNonCriticalAutosavesMock).toHaveBeenCalledWith(
      'ACME',
      'Evento de marca',
      [{ descripcion: 'Audio', precio_unitario: 1000, x_pagar: 800 }],
      'POST /api/cotizaciones',
    )
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 'SH007', estado: 'BORRADOR' })
  })

  it('retorna 400 cuando la validación falla y no intenta reservar folio', async () => {
    mocks.validateMock.mockReturnValue({
      ok: false,
      error: 'Datos inválidos',
      details: { cliente: ['Requerido'] },
    })

    const response = await POST(
      new Request('http://localhost/api/cotizaciones', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    )

    expect(response.status).toBe(400)
    expect(mocks.reserveNextQuotationFolioMock).not.toHaveBeenCalled()
    expect(mocks.createOrReplaceCotizacionMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      error: 'Datos inválidos',
      details: { cliente: ['Requerido'] },
    })
  })
})
