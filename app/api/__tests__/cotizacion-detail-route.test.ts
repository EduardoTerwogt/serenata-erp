import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getCotizacionByIdMock: vi.fn(),
  buildUpdateCotizacionPayloadMock: vi.fn(),
  createOrReplaceCotizacionMock: vi.fn(),
  runQuotationNonCriticalAutosavesMock: vi.fn(),
  validateMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/db', () => ({
  getCotizacionById: mocks.getCotizacionByIdMock,
  deleteCotizacion: vi.fn(),
  deleteItemsByCotizacion: vi.fn(),
}))

vi.mock('@/lib/server/quotations/persistence', () => ({
  buildUpdateCotizacionPayload: mocks.buildUpdateCotizacionPayloadMock,
  createOrReplaceCotizacion: mocks.createOrReplaceCotizacionMock,
  runQuotationNonCriticalAutosaves: mocks.runQuotationNonCriticalAutosavesMock,
}))

vi.mock('@/lib/validation/schemas', () => ({
  CotizacionUpdateSchema: {},
  validate: mocks.validateMock,
}))

import { PUT } from '../cotizaciones/[id]/route'

describe('PUT /api/cotizaciones/[id]', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset()
    mocks.getCotizacionByIdMock.mockReset()
    mocks.buildUpdateCotizacionPayloadMock.mockReset()
    mocks.createOrReplaceCotizacionMock.mockReset()
    mocks.runQuotationNonCriticalAutosavesMock.mockReset()
    mocks.validateMock.mockReset()

    mocks.requireSectionMock.mockResolvedValue({ response: null })
  })

  it('actualiza la cotización y regresa el recurso refrescado', async () => {
    const previousCotizacion = {
      id: 'SH001',
      cliente: 'ACME',
      proyecto: 'Evento viejo',
      fecha_entrega: '2026-04-10',
      locacion: 'CDMX',
      fecha_cotizacion: '2026-04-08',
      items: [],
    }

    const updatedCotizacion = {
      id: 'SH001',
      cliente: 'ACME',
      proyecto: 'Evento nuevo',
      estado: 'BORRADOR',
    }

    mocks.getCotizacionByIdMock
      .mockResolvedValueOnce(previousCotizacion)
      .mockResolvedValueOnce(updatedCotizacion)

    mocks.validateMock.mockReturnValue({
      ok: true,
      data: {
        proyecto: 'Evento nuevo',
        items: [{ descripcion: 'Audio', precio_unitario: 1000 }],
        porcentaje_fee: 0.15,
        iva_activo: true,
        descuento_tipo: 'monto',
        descuento_valor: 0,
      },
    })

    mocks.buildUpdateCotizacionPayloadMock.mockResolvedValue({
      id: 'SH001',
      cliente: 'ACME',
      proyecto: 'Evento nuevo',
      items: [{ descripcion: 'Audio', precio_unitario: 1000 }],
    })

    const response = await PUT(
      new Request('http://localhost/api/cotizaciones/SH001', {
        method: 'PUT',
        body: JSON.stringify({ proyecto: 'Evento nuevo' }),
      }),
      { params: Promise.resolve({ id: 'SH001' }) },
    )

    expect(mocks.buildUpdateCotizacionPayloadMock).toHaveBeenCalledWith(
      'SH001',
      previousCotizacion,
      { proyecto: 'Evento nuevo' },
      [{ descripcion: 'Audio', precio_unitario: 1000 }],
      {
        porcentaje_fee: 0.15,
        iva_activo: true,
        descuento_tipo: 'monto',
        descuento_valor: 0,
      },
    )
    expect(mocks.createOrReplaceCotizacionMock).toHaveBeenCalledWith({
      id: 'SH001',
      cliente: 'ACME',
      proyecto: 'Evento nuevo',
      items: [{ descripcion: 'Audio', precio_unitario: 1000 }],
    })
    expect(mocks.runQuotationNonCriticalAutosavesMock).toHaveBeenCalledWith(
      'ACME',
      'Evento nuevo',
      [{ descripcion: 'Audio', precio_unitario: 1000 }],
      'PUT /api/cotizaciones/:id',
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(updatedCotizacion)
  })

  it('retorna 400 cuando la validación falla', async () => {
    mocks.getCotizacionByIdMock.mockResolvedValue({
      id: 'SH001',
      cliente: 'ACME',
      proyecto: 'Evento viejo',
      fecha_entrega: '2026-04-10',
      locacion: 'CDMX',
      fecha_cotizacion: '2026-04-08',
      items: [],
    })

    mocks.validateMock.mockReturnValue({
      ok: false,
      error: 'Payload inválido',
      details: { proyecto: ['Requerido'] },
    })

    const response = await PUT(
      new Request('http://localhost/api/cotizaciones/SH001', {
        method: 'PUT',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'SH001' }) },
    )

    expect(response.status).toBe(400)
    expect(mocks.buildUpdateCotizacionPayloadMock).not.toHaveBeenCalled()
    expect(mocks.createOrReplaceCotizacionMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      error: 'Payload inválido',
      details: { proyecto: ['Requerido'] },
    })
  })
})
