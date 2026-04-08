import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSectionMock = vi.fn()
const getCotizacionByIdMock = vi.fn()
const buildCreateCotizacionPayloadMock = vi.fn()
const createOrReplaceCotizacionMock = vi.fn()
const runQuotationNonCriticalAutosavesMock = vi.fn()
const validateMock = vi.fn()
const reserveNextQuotationFolioMock = vi.fn()
const consumeReservedQuotationFolioMock = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  requireSection: requireSectionMock,
}))

vi.mock('@/lib/db', () => ({
  getCotizacionById: getCotizacionByIdMock,
}))

vi.mock('@/lib/server/quotations/persistence', () => ({
  buildCreateCotizacionPayload: buildCreateCotizacionPayloadMock,
  createOrReplaceCotizacion: createOrReplaceCotizacionMock,
  runQuotationNonCriticalAutosaves: runQuotationNonCriticalAutosavesMock,
}))

vi.mock('@/lib/validation/schemas', () => ({
  CotizacionCreateSchema: {},
  validate: validateMock,
}))

vi.mock('@/lib/server/quotations/folio', () => ({
  reserveNextQuotationFolio: reserveNextQuotationFolioMock,
  consumeReservedQuotationFolio: consumeReservedQuotationFolioMock,
}))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {},
}))

import { POST } from '../cotizaciones/route'

describe('POST /api/cotizaciones', () => {
  beforeEach(() => {
    requireSectionMock.mockReset()
    getCotizacionByIdMock.mockReset()
    buildCreateCotizacionPayloadMock.mockReset()
    createOrReplaceCotizacionMock.mockReset()
    runQuotationNonCriticalAutosavesMock.mockReset()
    validateMock.mockReset()
    reserveNextQuotationFolioMock.mockReset()
    consumeReservedQuotationFolioMock.mockReset()

    requireSectionMock.mockResolvedValue({ response: null })
  })

  it('reserva folio al guardar, persiste la cotización y regresa 201', async () => {
    validateMock.mockReturnValue({
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

    reserveNextQuotationFolioMock.mockResolvedValue({
      folio: 'SH007',
      reservationToken: 'token-007',
      atomic: true,
      expiresAt: '2026-04-08T12:00:00.000Z',
    })

    buildCreateCotizacionPayloadMock.mockResolvedValue({
      folio: 'SH007',
      payload: { id: 'SH007', cliente: 'ACME' },
    })

    getCotizacionByIdMock.mockResolvedValue({ id: 'SH007', estado: 'BORRADOR' })

    const response = await POST(
      new Request('http://localhost/api/cotizaciones', {
        method: 'POST',
        body: JSON.stringify({
          cliente: 'ACME',
          proyecto: 'Evento de marca',
        }),
      }),
    )

    expect(reserveNextQuotationFolioMock).toHaveBeenCalledWith(undefined)
    expect(buildCreateCotizacionPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'SH007', cliente: 'ACME' }),
      [{ descripcion: 'Audio', precio_unitario: 1000, x_pagar: 800 }],
      expect.objectContaining({
        forcedFolio: 'SH007',
        preventOverwrite: true,
      }),
    )
    expect(createOrReplaceCotizacionMock).toHaveBeenCalledWith({ id: 'SH007', cliente: 'ACME' })
    expect(consumeReservedQuotationFolioMock).toHaveBeenCalledWith('SH007', 'token-007')
    expect(runQuotationNonCriticalAutosavesMock).toHaveBeenCalledWith(
      'ACME',
      'Evento de marca',
      [{ descripcion: 'Audio', precio_unitario: 1000, x_pagar: 800 }],
      'POST /api/cotizaciones',
    )
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 'SH007', estado: 'BORRADOR' })
  })

  it('retorna 400 cuando la validación falla y no intenta reservar folio', async () => {
    validateMock.mockReturnValue({
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
    expect(reserveNextQuotationFolioMock).not.toHaveBeenCalled()
    expect(createOrReplaceCotizacionMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      error: 'Datos inválidos',
      details: { cliente: ['Requerido'] },
    })
  })
})
