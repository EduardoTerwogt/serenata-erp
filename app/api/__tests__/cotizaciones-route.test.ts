import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getCotizacionByIdMock: vi.fn(),
  buscarCotizacionesMock: vi.fn(),
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
  buscarCotizaciones: mocks.buscarCotizacionesMock,
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

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {},
}))

import { GET, POST } from '../cotizaciones/route'

// EF-3 3B-4: GET delega busqueda/paginacion/conteos por estado a la RPC
// unica buscar_cotizaciones (via buscarCotizaciones()) -- ya no trae
// cotizaciones(*, items_cotizacion(*)) sin limite.
describe('GET /api/cotizaciones', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset().mockResolvedValue({ response: null })
    mocks.buscarCotizacionesMock.mockReset().mockResolvedValue({
      rows: [{ id: 'SH001', estado: 'BORRADOR', items_count: 2 }],
      total_rows: 1,
      counts_by_estado: { TODAS: 1, BORRADOR: 1, EMITIDA: 0, APROBADA: 0, CANCELADA: 0 },
    })
  })

  it('llama buscarCotizaciones con los defaults cuando no hay querystring', async () => {
    const res = await GET(new Request('http://localhost/api/cotizaciones'))
    expect(mocks.buscarCotizacionesMock).toHaveBeenCalledWith(null, null, 1, 10)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rows).toEqual([{ id: 'SH001', estado: 'BORRADOR', items_count: 2 }])
    expect(body.total_rows).toBe(1)
  })

  it('parsea search/estado/page/pageSize del querystring', async () => {
    await GET(new Request('http://localhost/api/cotizaciones?search=SH001&estado=BORRADOR&page=2&pageSize=20'))
    expect(mocks.buscarCotizacionesMock).toHaveBeenCalledWith('SH001', 'BORRADOR', 2, 20)
  })

  it('responde 500 sin exponer el error interno si la RPC falla', async () => {
    mocks.buscarCotizacionesMock.mockRejectedValueOnce(new Error('db down'))
    const res = await GET(new Request('http://localhost/api/cotizaciones'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('db down')
  })
})

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
